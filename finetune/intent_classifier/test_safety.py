import unittest

from finetune.intent_classifier.safety import inspect_safety


class UnsupportedCapabilityTests(unittest.TestCase):
    def test_rejects_actions_the_app_cannot_perform(self):
        for text in (
            "fă-mi check-in pentru zbor", "rezervă-mi un taxi la terminal",
            "care e parola de wifi", "cumpără-mi un bilet spre Roma",
            "anulează-mi rezervarea", "vreau upgrade la business",
        ):
            with self.subTest(text=text):
                verdict = inspect_safety(text)
                self.assertFalse(verdict.is_safe)
                self.assertEqual(verdict.label, "none")
                self.assertEqual(verdict.action, "none")

    def test_allows_supported_fact_requests(self):
        for text in (
            "care este poarta zborului meu", "avem întârziere la cursă",
            "pot lua un powerbank în cabină", "unde este toaleta",
        ):
            with self.subTest(text=text):
                self.assertTrue(inspect_safety(text).is_safe)

    def test_rejects_general_chitchat_even_with_airport_context(self):
        for text in (
            "spune-mi un banc, sunt deja în aeroport",
            "scrie-mi o poezie, am biletul deschis",
            "care este vremea la mare săptămâna viitoare",
        ):
            with self.subTest(text=text):
                self.assertFalse(inspect_safety(text).is_safe)


if __name__ == "__main__":
    unittest.main()
