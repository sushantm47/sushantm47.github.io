"""Tests for the resume parser. Run: python -m unittest discover -s tests -p 'test_*.py'"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from parse_resume import ResumeError, parse_text  # noqa: E402

TEXT = (Path(__file__).parent / "fixtures" / "resume.txt").read_text()


class ParseResume(unittest.TestCase):
    def setUp(self):
        self.r = parse_text(TEXT)

    def test_header_and_summary(self):
        self.assertEqual(self.r["name"], "Sushant Mudalgi")
        self.assertEqual(self.r["contact"]["email"], "mudalgi.s@northeastern.edu")
        self.assertEqual(self.r["contact"]["github"], "https://github.com/sushantm47")
        self.assertTrue(self.r["summary"].startswith("Software engineer with four years"))
        self.assertIn("200 to 300 GB daily", self.r["summary"])

    def test_experience_titles_locations_and_wrapped_bullets(self):
        jobs = {j["company"]: j for j in self.r["experience"]}
        self.assertEqual(list(jobs), ["Takeda", "EY GDS", "Deloitte USI"])
        self.assertEqual((jobs["Takeda"]["title"], jobs["Takeda"]["location"]),
                         ("Data Engineer L4", "Bangalore, India"))
        self.assertEqual(jobs["Deloitte USI"]["title"], "Software Engineering Analyst")
        self.assertEqual((jobs["EY GDS"]["start"], jobs["EY GDS"]["end"]), ("Nov 2024", "Apr 2025"))
        self.assertEqual(len(jobs["EY GDS"]["bullets"]), 4)
        self.assertIn("regulatory reporting across North America", jobs["Takeda"]["bullets"][0])

    def test_education_skills_and_projects(self):
        ms, be = self.r["education"]
        self.assertEqual((ms["degree"], ms["end"]), ("MS in Computer Science", "May 2027"))
        self.assertEqual(be["gpa"], "3.91/4.00")
        self.assertIn("MLOps", ms["coursework"])
        groups = {g["group"]: g["items"] for g in self.r["skills"]}
        self.assertIn("Databricks (Delta Lake, Unity Catalog)", groups["Data"])
        root = self.r["projects"][0]
        self.assertEqual((root["name"], root["subtitle"]), ("RootCite", "AI Copilot for Production Alerts"))
        self.assertEqual(root["links"], ["Git", "Demo"])
        self.assertIn("AWS CDK", root["stack"])
        self.assertEqual(len(root["bullets"]), 3)

    def test_multi_word_cities_and_present_dates(self):
        r = parse_text(TEXT.replace("Data Engineer L4 Bangalore, India", "Data Engineer New York, NY")
                           .replace("May 2025 - Aug 2025", "May 2025 - Present"))
        job = r["experience"][0]
        self.assertEqual((job["title"], job["location"], job["end"]), ("Data Engineer", "New York, NY", "Present"))

    def test_unreadable_resumes_fail_loudly(self):
        with self.assertRaises(ResumeError):
            parse_text("just a few\nlines\nof text\nthat are\nnot a resume\nat all")


if __name__ == "__main__":
    unittest.main()
