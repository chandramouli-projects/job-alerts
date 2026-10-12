"""Unit tests for track_mail.parse: python -m unittest tests/test_track_mail.py (from the project folder)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend" / "mail"))
from track_mail import parse  # noqa: E402

LI = "LinkedIn <jobs-noreply@linkedin.com>"


class ParseTests(unittest.TestCase):
    def check(self, subject, body, sender, stage, company, title=""):
        got = parse(subject, body, sender)
        self.assertIsNotNone(got, subject)
        self.assertEqual(got["stage"], stage, subject)
        self.assertEqual(got["company"], company, subject)
        if title:
            self.assertEqual(got["title"], title, subject)

    def test_linkedin_sent(self):
        self.check("Chandramouli, your application was sent to Acme Technologies", "QA Automation Engineer\nAcme Technologies · Hyderabad", LI, "applied", "Acme Technologies")

    def test_linkedin_viewed(self):
        self.check("Your application was viewed by Acme Technologies", "", LI, "viewed", "Acme Technologies")

    def test_linkedin_rejection(self):
        self.check("Your application to QA Engineer at Zeta", "Unfortunately, we will not be moving forward with your application.", LI, "rejected", "Zeta", "QA Engineer")

    def test_naukri_shortlisted(self):
        self.check("Recruiter shortlisted your application for Software Test Engineer at Mayura Consultancy Services",
                   "", "Naukri <info@naukri.com>", "shortlisted", "Mayura Consultancy Services", "Software Test Engineer")

    def test_company_system_interview(self):
        self.check("Interview invitation", "We would like to invite you to an interview for the QA Engineer role at Beta.",
                   "Beta Careers <no-reply@greenhouse.io>", "interview", "Beta")

    def test_company_system_received(self):
        self.check("Thank you for applying to Groww", "We received your application for the SDET position.", "Groww Hiring <no-reply@lever.co>", "applied", "Groww")

    def test_offer(self):
        self.check("Offer letter - Test Engineer at Delta", "We are pleased to offer you the role.", "Delta <hr@myworkday.com>", "offer", "Delta")

    def test_job_alerts_are_ignored(self):
        self.assertIsNone(parse("30 new jobs for you: QA Engineer", "Apply now. You applied to 2 jobs this week.", LI))
        self.assertIsNone(parse("Jobs you may be interested in", "", "Naukri <alerts@naukri.com>"))

    def test_other_senders_are_ignored(self):
        self.assertIsNone(parse("Your application was sent to Acme", "", "Friend <friend@gmail.com>"))

    def test_no_status_words_is_ignored(self):
        self.assertIsNone(parse("Complete your profile", "Add a photo to stand out", LI))


if __name__ == "__main__":
    unittest.main()
