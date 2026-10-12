"""
Read job-application emails from Gmail and turn them into status updates
(Applied, Viewed, Shortlisted, Interview, Offer, Not selected).

Only emails from job sites and company hiring systems are read, and they stay unread
(BODY.PEEK). Nothing is sent or deleted. backend/server/mail-sync.mjs runs this every 15 minutes
and matches each update to the person's applications.

Needs in .env:  GMAIL_ADDRESS, GMAIL_APP_PASSWORD (a Google "App password", not the real password)

  python backend/mail/track_mail.py           ->  prints what it found, for a person to read
  python backend/mail/track_mail.py --json    ->  {"events": [...]} for the server
  python backend/mail/track_mail.py --days 30
"""
import email
import hashlib
import html
import imaplib
import json
import os
import re
import sys
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent   # the project folder, where .env is
if (ROOT / ".env").exists():
    for line in (ROOT / ".env").read_text().splitlines():
        k, sep, v = line.partition("=")
        if sep and not k.strip().startswith("#") and v.strip():
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))

# Job sites and hiring systems whose emails carry application updates
SENDERS = {"linkedin.com": "LinkedIn", "naukri.com": "Naukri", "indeed.com": "Indeed", "foundit.in": "Foundit",
           "instahyre.com": "Instahyre", "glassdoor.com": "Glassdoor", "internshala.com": "Internshala",
           "wellfound.com": "Wellfound", "cutshort.io": "Cutshort", "hirist.tech": "Hirist", "apna.co": "Apna",
           "greenhouse.io": "Greenhouse", "lever.co": "Lever", "myworkday.com": "Workday",
           "smartrecruiters.com": "SmartRecruiters", "ashbyhq.com": "Ashby", "zohorecruit.com": "Zoho Recruit"}

# Most advanced first: an email that says "unfortunately" is a rejection even if it also says "applied"
STAGE_RULES = [
    ("rejected", r"unfortunately|not (?:be )?moving forward|decided (?:to )?(?:move|go|proceed) forward with other|"
                 r"not (?:been )?selected|regret to inform|position (?:has been|is now) filled|will not be proceeding|"
                 r"not a (?:fit|match) at this time|no longer under consideration"),
    ("offer", r"offer letter|pleased to (?:extend|offer)|job offer|we(?:'d| would) like to offer you"),
    ("interview", r"interview (?:invitation|invite|scheduled|call|round)|invit\w* you (?:to|for) (?:an? )?interview|"
                  r"schedule (?:an?|your) interview|interview with"),
    ("shortlisted", r"shortlist|moved (?:you )?(?:to|forward to) the next (?:round|step|stage)|recruiter (?:is|was) interested|"
                    r"interested in your (?:profile|application)|under consideration|in review"),
    ("viewed", r"(?:application|profile) (?:was |has been )?viewed|viewed your (?:application|profile)"),
    ("applied", r"application (?:was )?sent|application (?:has been |was )?(?:received|submitted)|thank(?:s| you) for applying|"
                r"you(?:'ve| have)? applied|successfully applied|applied (?:for|to)|we received your application"),
]
# Emails about other things (job alerts, newsletters) that could share words with the rules above
SKIP = r"jobs? (?:alert|for you|you may be interested)|recommended jobs|new jobs|apply now|people also viewed|who viewed your profile"

COMPANY_PATTERNS = [
    r"application (?:was )?(?:sent|viewed|submitted) (?:to|by) (?P<company>.+?)$",
    r"application to (?P<title>.+?) at (?P<company>.+?)$",
    r"(?:for|as) (?:the |a |an )?(?P<title>.+?) (?:role |position |job )?at (?P<company>.+?)$",
    r"(?:update|news|message) from (?P<company>.+?)$",
    r"(?P<company>.+?) (?:viewed|received|reviewed) your application",
    r"thank(?:s| you) for applying (?:to|at) (?P<company>.+?)$",
]
TITLE_PATTERNS = [
    r"(?:applied|application) (?:for|to) (?:the )?(?:position |role |job )?(?:of )?[\"'“]?(?P<title>[^\n\"'”]{3,80}?)[\"'”]? "
    r"(?:position |role |job )?at (?P<company>[^\n.,]{2,60})",
    r"(?:position|role|job)(?: title)?:\s*(?P<title>[^\n]{3,80})",
]


def text_of(msg):
    """Plain text of an email; HTML is turned into text when there is no plain part."""
    plain, rich = [], []
    for part in msg.walk() if msg.is_multipart() else [msg]:
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html") or part.get("Content-Disposition", "").startswith("attachment"):
            continue
        try:
            body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
        except Exception:
            continue
        (plain if ctype == "text/plain" else rich).append(body)
    if plain:
        return "\n".join(plain)
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", "\n".join(rich))
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</h\d>", "\n", s)
    return html.unescape(re.sub(r"<[^>]+>", " ", s))


def clean(s):
    s = re.sub(r"\s+", " ", s or "").strip(" -–|:.,!\"'“”")
    return re.sub(r"(?i)^(?:the|a|an) ", "", s)[:80]


def site_of(sender):
    domain = parseaddr(sender)[1].split("@")[-1].lower()
    return next((name for d, name in SENDERS.items() if domain == d or domain.endswith("." + d)), None)


def parse(subject, body, sender, date=""):
    """One email -> {stage, company, title, site} or None when it is not an application update."""
    site = site_of(sender)
    if not site:
        return None
    head = f"{subject}\n{body[:3000]}"
    low = re.sub(r"\s+", " ", head.lower())
    if re.search(SKIP, subject.lower()):
        return None
    stage = next((s for s, rx in STAGE_RULES if re.search(rx, low)), None)
    if not stage:
        return None
    company = title = ""
    subj = re.sub(r"(?i)^(?:re|fwd?):\s*|^[^,]{1,40},\s*", "", subject.strip())   # drop "Re:" and a leading "Name, "
    for rx in COMPANY_PATTERNS:
        m = re.search(rx, subj, re.I)
        if m:
            company = clean(m.group("company"))
            title = clean(m.groupdict().get("title") or "")
            break
    if not title or not company:
        for rx in TITLE_PATTERNS:
            m = re.search(rx, body[:4000], re.I)
            if m:
                title = title or clean(m.group("title"))
                company = company or clean(m.groupdict().get("company") or "")
                break
    if not company and site not in ("LinkedIn", "Naukri", "Indeed", "Foundit", "Instahyre", "Glassdoor",
                                     "Internshala", "Wellfound", "Cutshort", "Hirist", "Apna"):
        # company hiring systems send in the company's name: "Acme Careers <no-reply@greenhouse.io>"
        company = clean(re.sub(r"(?i)\b(careers?|hiring|talent|recruiting|team|jobs|via \w+)\b", "", parseaddr(sender)[0]))
    if not company:
        return None
    return {"stage": stage, "company": company, "title": title, "site": site}


def fetch(days):
    user, pw = os.getenv("GMAIL_ADDRESS"), os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "")
    if not (user and pw):
        raise RuntimeError("GMAIL_ADDRESS and GMAIL_APP_PASSWORD are not set in .env")
    box = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=60)
    try:
        box.login(user, pw)
    except imaplib.IMAP4.error:
        raise RuntimeError("Gmail refused the login. Check GMAIL_ADDRESS and the App password.")
    try:
        if box.select('"[Gmail]/All Mail"', readonly=True)[0] != "OK":
            box.select("INBOX", readonly=True)
        query = "from:(" + " OR ".join(SENDERS) + f") newer_than:{days}d"
        typ, data = box.search(None, "X-GM-RAW", f'"{query}"')
        ids = data[0].split()[-400:] if typ == "OK" else []
        events = []
        for i in ids:
            typ, parts = box.fetch(i, "(BODY.PEEK[])")
            if typ != "OK" or not parts or not isinstance(parts[0], tuple):
                continue
            msg = email.message_from_bytes(parts[0][1])
            subject = str(make_header(decode_header(msg.get("Subject", ""))))
            sender = str(make_header(decode_header(msg.get("From", ""))))
            ev = parse(subject, text_of(msg), sender)
            if not ev:
                continue
            try:
                at = parsedate_to_datetime(msg.get("Date")).isoformat()
            except Exception:
                at = ""
            mid = msg.get("Message-ID") or hashlib.sha1((subject + at).encode()).hexdigest()
            events.append({"id": mid.strip(), "at": at, "subject": subject[:160], **ev})
        return sorted(events, key=lambda e: e["at"])
    finally:
        try:
            box.logout()
        except Exception:
            pass


def main():
    days = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 60
    as_json = "--json" in sys.argv
    try:
        events = fetch(days)
    except Exception as e:
        if as_json:
            print(json.dumps({"error": str(e)}))
            sys.exit(0)
        sys.exit(f"Error: {e}")
    if as_json:
        print(json.dumps({"events": events}, ensure_ascii=False))
        return
    print(f"{len(events)} application updates in the last {days} days:")
    for e in events:
        print(f"  {e['at'][:10]}  {e['stage']:<11} {e['company']} | {e['title'] or '-'}  ({e['site']})  [{e['subject']}]")


if __name__ == "__main__":
    main()
