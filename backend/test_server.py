import gc
import tempfile
import unittest
from pathlib import Path

import server


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.original_database = server.DATABASE
        self.original_testing = server.app.config["TESTING"]

        server.DATABASE = Path(self.temp_directory.name) / "test.db"
        server.app.config["TESTING"] = True
        server.init_db()

        self.client = server.app.test_client()

    def tearDown(self):
        server.DATABASE = self.original_database
        server.app.config["TESTING"] = self.original_testing

        gc.collect()
        self.temp_directory.cleanup()

    def create_task(self, title="Test task", category="general"):
        response = self.client.post(
            "/api/tasks",
            json={"title": title, "category": category}
        )

        self.assertEqual(response.status_code, 201)
        return response.get_json()["id"]

    def earn_coins(self, task_count):
        for number in range(task_count):
            task_id = self.create_task(title=f"Task {number}")

            response = self.client.post(
                f"/api/tasks/{task_id}/complete"
            )

            self.assertEqual(response.status_code, 200)

    def get_player(self):
        response = self.client.get("/api/player")
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def get_shop(self):
        response = self.client.get("/api/shop")
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def test_completion_awards_rewards_only_once(self):
        task_id = self.create_task(category="fitness")

        first = self.client.post(
            f"/api/tasks/{task_id}/complete"
        )
        self.assertEqual(first.status_code, 200)

        first_data = first.get_json()
        self.assertEqual(first_data["xp_awarded"], 10)
        self.assertEqual(first_data["coins_awarded"], 10)

        second = self.client.post(
            f"/api/tasks/{task_id}/complete"
        )
        self.assertEqual(second.status_code, 200)

        second_data = second.get_json()
        self.assertEqual(second_data["xp_awarded"], 0)
        self.assertEqual(second_data["coins_awarded"], 0)

        player = self.get_player()
        self.assertEqual(player["xp"], 10)
        self.assertEqual(player["coins"], 10)

        character = self.client.get("/api/character-state").get_json()
        self.assertEqual(character["xp"]["fitness"], 10)
        self.assertIn("headband", character["unlocked_items"])

    def test_purchase_charges_once_and_saves_ownership(self):
        self.earn_coins(6)

        response = self.client.post("/api/shop/1/purchase")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["coins"], 10)

        repeated = self.client.post("/api/shop/1/purchase")
        self.assertEqual(repeated.status_code, 409)

        shop = self.get_shop()
        self.assertEqual(shop["coins"], 10)

        hat = next(item for item in shop["items"] if item["id"] == 1)
        self.assertTrue(hat["owned"])

    def test_insufficient_coins_preserves_balance_and_inventory(self):
        self.earn_coins(1)

        response = self.client.post("/api/shop/1/purchase")
        self.assertEqual(response.status_code, 409)

        shop = self.get_shop()
        self.assertEqual(shop["coins"], 10)
        self.assertFalse(any(item["owned"] for item in shop["items"]))

    def test_unknown_item_does_not_charge_coins(self):
        self.earn_coins(1)

        response = self.client.post("/api/shop/999/purchase")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.get_player()["coins"], 10)

    def test_delete_removes_task_without_rewards(self):
        task_id = self.create_task()

        response = self.client.delete(f"/api/tasks/{task_id}")
        self.assertEqual(response.status_code, 200)

        tasks = self.client.get("/api/tasks").get_json()
        self.assertEqual(tasks, [])

        player = self.get_player()
        self.assertEqual(player["xp"], 0)
        self.assertEqual(player["coins"], 0)

        repeated = self.client.delete(f"/api/tasks/{task_id}")
        self.assertEqual(repeated.status_code, 404)

    def test_completed_task_cannot_be_deleted(self):
        task_id = self.create_task()
        self.client.post(f"/api/tasks/{task_id}/complete")

        response = self.client.delete(f"/api/tasks/{task_id}")
        self.assertEqual(response.status_code, 409)

        tasks = self.client.get("/api/tasks").get_json()
        self.assertEqual(len(tasks), 1)
        self.assertTrue(tasks[0]["completed"])

    def test_invalid_tasks_are_rejected(self):
        invalid_requests = [
            {"title": ""},
            {"title": "   "},
            {"title": 123},
            {"title": "Study", "category": "unknown"},
            ["not", "an", "object"]
        ]

        for body in invalid_requests:
            with self.subTest(body=body):
                response = self.client.post("/api/tasks", json=body)
                self.assertEqual(response.status_code, 400)

        tasks = self.client.get("/api/tasks").get_json()
        self.assertEqual(tasks, [])

    def test_customization_saves_and_rejects_invalid_choices(self):
        response = self.client.patch(
            "/api/player/customization",
            json={"character_model": "female"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get_player()["character_model"], "female")

        for invalid_model in ("unknown", None, 123, []):
            with self.subTest(model=invalid_model):
                response = self.client.patch(
                    "/api/player/customization",
                    json={"character_model": invalid_model}
                )
                self.assertEqual(response.status_code, 400)

        self.assertEqual(self.get_player()["character_model"], "female")

        server.init_db()
        self.assertEqual(self.get_player()["character_model"], "female")

    def test_xp_reset_preserves_coins_inventory_and_customization(self):
        self.earn_coins(6)

        purchase = self.client.post("/api/shop/1/purchase")
        self.assertEqual(purchase.status_code, 201)

        customization = self.client.patch(
            "/api/player/customization",
            json={"character_model": "female"}
        )
        self.assertEqual(customization.status_code, 200)

        response = self.client.post(
            "/api/reset-state",
            json={"mode": "reset"}
        )
        self.assertEqual(response.status_code, 200)

        player = self.get_player()
        self.assertEqual(player["xp"], 0)
        self.assertEqual(player["coins"], 10)
        self.assertEqual(player["character_model"], "female")

        character = response.get_json()
        self.assertTrue(all(xp == 0 for xp in character["xp"].values()))
        self.assertEqual(character["unlocked_items"], [])

        shop = self.get_shop()
        hat = next(item for item in shop["items"] if item["id"] == 1)
        self.assertTrue(hat["owned"])

        tasks = self.client.get("/api/tasks").get_json()
        self.assertEqual(len(tasks), 6)
        self.assertTrue(all(task["completed"] for task in tasks))


if __name__ == "__main__":
    unittest.main()