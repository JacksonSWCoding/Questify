import gc
import tempfile
import unittest
from pathlib import Path

import server


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
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

    def test_equipment_saved_and_removed_without_spending_coins(self):
        task = self.create_task(category="fitness")
        self.client.post(f"/api/tasks/{task}/complete")
        before = self.get_player()
        response = self.client.patch("/api/player/customization", json={
            "character_model": "female", "equipped_items": ["black_shoes"]
        })
        self.assertEqual(response.status_code, 200)
        server.init_db()
        player = self.get_player()
        self.assertEqual(player["equipped_items"], ["black_shoes"])
        self.assertEqual(player["character_model"], "female")
        self.assertEqual(player["coins"], before["coins"])
        self.assertEqual(player["xp"], before["xp"])
        response = self.client.patch("/api/player/customization", json={
            "character_model": "female", "equipped_items": []
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get_player()["equipped_items"], [])

    def test_invalid_equipment_does_not_partially_save_model(self):
        for gear in (["wand"], ["unknown"], [None], None, "glasses"):
            response = self.client.patch("/api/player/customization", json={
                "character_model": "female", "equipped_items": gear
            })
            self.assertIn(response.status_code, (400, 403))
            self.assertEqual(self.get_player()["character_model"], "male")
            self.assertEqual(self.get_player()["equipped_items"], [])

    def test_reset_clears_equipment_but_preserves_purchase(self):
        self.earn_coins(10)
        self.assertEqual(
            self.client.post("/api/shop/forest_background/purchase").status_code,
            201,
        )
        task = self.create_task(category="coding")
        self.client.post(f"/api/tasks/{task}/complete")
        self.client.patch("/api/player/customization", json={
            "character_model": "female", "equipped_items": ["glasses"]
        })
        coins_before_reset = self.get_player()["coins"]
        self.client.post("/api/reset-state", json={"mode": "reset"})
        self.assertEqual(self.get_player()["equipped_items"], [])
        self.assertEqual(self.get_player()["coins"], coins_before_reset)
        forest = next(
            item for item in self.get_shop()["items"]
            if item["id"] == "forest_background"
        )
        self.assertTrue(forest["owned"])

    def test_shop_requirement_checked_on_server(self):
        self.earn_coins(10)
        before = self.get_player()["coins"]
        self.assertEqual(self.client.post("/api/shop/red_hat/purchase").status_code, 403)
        self.assertEqual(self.get_player()["coins"], before)
        task = self.create_task(category="creative")
        complete = self.client.post(f"/api/tasks/{task}/complete")
        self.assertEqual(complete.status_code, 200)
        coins_after_quest = self.get_player()["coins"]
        self.assertEqual(self.client.post("/api/shop/red_hat/purchase").status_code, 201)
        self.assertEqual(self.client.post("/api/shop/red_hat/purchase").status_code, 409)
        self.assertEqual(self.get_player()["coins"], coins_after_quest - 50)

    def test_edit_task_survives_integration(self):
        task = self.create_task()
        response = self.client.patch(f"/api/tasks/{task}", json={
            "title": "Updated", "category": "coding"
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["title"], "Updated")
        self.client.post(f"/api/tasks/{task}/complete")
        response = self.client.patch(f"/api/tasks/{task}", json={
            "title": "Too late", "category": "general"
        })
        self.assertEqual(response.status_code, 409)

    def test_completion_awards_rewards_only_once(self):
        task_id = self.create_task(category="fitness")

        first = self.client.post(
            f"/api/tasks/{task_id}/complete"
        )
        self.assertEqual(first.status_code, 200)

        first_data = first.get_json()
        self.assertEqual(first_data["xp_awarded"], 10)
        # Base reward plus first fitness unlock (black_shoes).
        self.assertEqual(first_data["coins_awarded"], 25)

        second = self.client.post(
            f"/api/tasks/{task_id}/complete"
        )
        self.assertEqual(second.status_code, 200)

        second_data = second.get_json()
        self.assertEqual(second_data["xp_awarded"], 0)
        self.assertEqual(second_data["coins_awarded"], 0)

        player = self.get_player()
        self.assertEqual(player["xp"], 10)
        self.assertEqual(player["coins"], 25)

        character = self.client.get("/api/character-state").get_json()
        self.assertEqual(character["xp"]["fitness"], 10)
        self.assertIn("black_shoes", character["unlocked_items"])

    def test_purchase_charges_once_and_saves_ownership(self):
        self.earn_coins(6)
        creative = self.create_task(category="creative")
        self.client.post(f"/api/tasks/{creative}/complete")

        coins_before_purchase = self.get_player()["coins"]
        response = self.client.post("/api/shop/red_hat/purchase")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["coins"], coins_before_purchase - 50)

        repeated = self.client.post("/api/shop/red_hat/purchase")
        self.assertEqual(repeated.status_code, 409)

        shop = self.get_shop()
        self.assertEqual(shop["coins"], coins_before_purchase - 50)

        hat = next(item for item in shop["items"] if item["id"] == "red_hat")
        self.assertTrue(hat["owned"])

    def test_shop_equipment_persisted(self):
        self.earn_coins(10)
        self.assertEqual(
            self.client.post("/api/shop/forest_background/purchase").status_code,
            201
        )

        response = self.client.patch(
            "/api/player/shop-equipment",
            json={"backgrounds": "forest_background"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["backgrounds"],
            "forest_background"
        )

        shop = self.get_shop()
        self.assertEqual(
            shop["equipped_cosmetics"]["backgrounds"],
            "forest_background"
        )

        denied = self.client.patch(
            "/api/player/shop-equipment",
            json={"accessories": "red_hat"}
        )
        self.assertEqual(denied.status_code, 403)

    def test_insufficient_coins_preserves_balance_and_inventory(self):
        self.earn_coins(5)

        response = self.client.post("/api/shop/forest_background/purchase")
        self.assertEqual(response.status_code, 409)

        shop = self.get_shop()
        self.assertEqual(shop["coins"], self.get_player()["coins"])
        self.assertFalse(any(item["owned"] for item in shop["items"]))

    def test_unknown_item_does_not_charge_coins(self):
        self.earn_coins(1)

        coins_before = self.get_player()["coins"]
        response = self.client.post("/api/shop/999/purchase")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.get_player()["coins"], coins_before)

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
        creative = self.create_task(category="creative")
        self.client.post(f"/api/tasks/{creative}/complete")

        purchase = self.client.post("/api/shop/red_hat/purchase")
        self.assertEqual(purchase.status_code, 201)

        customization = self.client.patch(
            "/api/player/customization",
            json={"character_model": "female"}
        )
        self.assertEqual(customization.status_code, 200)

        coins_before_reset = self.get_player()["coins"]

        response = self.client.post(
            "/api/reset-state",
            json={"mode": "reset"}
        )
        self.assertEqual(response.status_code, 200)

        player = self.get_player()
        self.assertEqual(player["xp"], 0)
        self.assertEqual(player["coins"], coins_before_reset)
        self.assertEqual(player["character_model"], "female")

        character = response.get_json()
        self.assertTrue(all(xp == 0 for xp in character["xp"].values()))
        self.assertEqual(character["unlocked_items"], [])

        shop = self.get_shop()
        hat = next(item for item in shop["items"] if item["id"] == "red_hat")
        self.assertTrue(hat["owned"])

        tasks = self.client.get("/api/tasks").get_json()
        self.assertEqual(len(tasks), 7)
        self.assertTrue(all(task["completed"] for task in tasks))


if __name__ == "__main__":
    unittest.main()