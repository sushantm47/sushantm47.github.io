#!/usr/bin/env python3
"""Parse the resume PDF into data/resume.json, the source of truth for the site's content.

The parser expects a conventional one-column resume: a name line, a contact line separated
by "|", and sections headed SUMMARY, EDUCATION, SKILLS, EXPERIENCE, and PROJECTS (common
variants such as "WORK EXPERIENCE" are accepted). If the result is incomplete it exits with
an error, so the build stops and the last good version of the site stays live.

Usage: python scripts/parse_resume.py assets/resume.pdf data/resume.json
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
DATE = rf"(?:{MONTH}\s+\d{{4}}|\d{{4}})"
RANGE = re.compile(rf"\s*({DATE})\s*[-–—]\s*({DATE}|Present|Current|Now)\s*$", re.IGNORECASE)
BULLET = re.compile(r"^\s*[•▪◦●\-–]\s+")
# "<title> <City>, <Region>": the city is the last word before the comma, plus a leading word
# for multi-word cities ("New York", "San Francisco").
LOCATION = re.compile(r"^(.*)\s+(\S+,\s*[A-Z][\w.]*(?:\s[A-Z][\w.]*)*)$")
CITY_PREFIXES = {"New", "San", "Los", "Las", "Santa", "St.", "Fort", "Salt", "Palo", "Mountain", "Kuala"}

SECTIONS = {
    "SUMMARY": "summary", "PROFILE": "summary", "ABOUT": "summary",
    "EDUCATION": "education",
    "SKILLS": "skills", "TECHNICAL SKILLS": "skills",
    "EXPERIENCE": "experience", "WORK EXPERIENCE": "experience",
    "PROFESSIONAL EXPERIENCE": "experience",
    "PROJECTS": "projects", "ACADEMIC PROJECTS": "projects", "SELECTED PROJECTS": "projects",
}


class ResumeError(ValueError):
    pass


def split_top_level(text: str, sep: str = ",") -> list[str]:
    """Split on a separator, ignoring separators inside parentheses."""
    parts, depth, current = [], 0, []
    for ch in text:
        depth += ch == "("
        depth -= ch == ")"
        if ch == sep and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    parts.append("".join(current).strip())
    return [p for p in parts if p]


def sections(lines: list[str]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {"header": []}
    current = "header"
    for line in lines:
        key = SECTIONS.get(line.strip().upper().rstrip(":"))
        if key and line.strip().upper() == line.strip():
            current = key
            found.setdefault(current, [])
        else:
            found.setdefault(current, []).append(line)
    return found


def parse_contact(line: str) -> dict[str, str]:
    contact: dict[str, str] = {}
    for part in re.split(r"\s*[|—·]\s*", line):
        part = part.strip()
        if "@" in part:
            contact["email"] = part
        elif "linkedin.com" in part:
            contact["linkedin"] = "https://" + part.removeprefix("https://").removeprefix("www.")
        elif "github.com" in part:
            contact["github"] = "https://" + part.removeprefix("https://").removeprefix("www.")
        elif re.search(r"\d{3}.*\d{4}", part):
            contact["phone"] = part
        elif re.search(r"\.[a-z]{2,}(/|$)", part):
            contact["website"] = "https://" + part.removeprefix("https://")
    return contact


def bullets(lines: list[str]) -> list[str]:
    """Join wrapped lines into whole bullets."""
    out: list[str] = []
    for line in lines:
        if BULLET.match(line):
            out.append(BULLET.sub("", line).strip())
        elif out and line.strip():
            out[-1] = f"{out[-1]} {line.strip()}"
    return out


def entries(lines: list[str]) -> list[list[str]]:
    """Group lines into entries; a new entry starts at a non-bullet line ending in a date range."""
    groups: list[list[str]] = []
    for line in lines:
        if not BULLET.match(line) and RANGE.search(line):
            groups.append([line])
        elif groups:
            groups[-1].append(line)
    return groups


def parse_experience(lines: list[str]) -> list[dict]:
    jobs = []
    for group in entries(lines):
        head = RANGE.search(group[0])
        company = group[0][: head.start()].strip()
        title_line = next((ln for ln in group[1:] if not BULLET.match(ln)), "")
        title, location = title_line.strip(), ""
        loc = LOCATION.match(title)
        if loc:
            title, location = loc.group(1).strip(), loc.group(2).strip()
            last = title.rsplit(" ", 1)
            if len(last) == 2 and last[1] in CITY_PREFIXES:
                title, location = last[0], f"{last[1]} {location}"
        jobs.append({
            "company": company,
            "title": title,
            "location": location,
            "start": head.group(1),
            "end": head.group(2),
            "bullets": bullets(group[1:]),
        })
    return jobs


def parse_education(lines: list[str]) -> list[dict]:
    schools = []
    for group in entries(lines):
        head = RANGE.search(group[0])
        text = group[0][: head.start()].strip()
        school, _, degree = text.partition(" - ")
        gpa = re.search(r"GPA:?\s*([\d.]+\s*/\s*[\d.]+)", degree)
        degree = re.sub(r";?\s*GPA:?\s*[\d.]+\s*/\s*[\d.]+", "", degree).strip(" ;")
        coursework = []
        for line in group[1:]:
            if line.lower().startswith("coursework:"):
                coursework = split_top_level(line.split(":", 1)[1])
        schools.append({
            "school": school.strip(), "degree": degree, "gpa": gpa.group(1).replace(" ", "") if gpa else "",
            "start": head.group(1), "end": head.group(2), "coursework": coursework,
        })
    return schools


def parse_skills(lines: list[str]) -> list[dict]:
    groups: list[dict] = []
    for line in lines:
        label = re.match(r"^([A-Z][\w &/+-]{1,40}):\s*(.*)$", line.strip())
        if label:
            groups.append({"group": label.group(1).strip(), "text": label.group(2)})
        elif groups:
            groups[-1]["text"] += " " + line.strip()
    return [{"group": g["group"], "items": split_top_level(g["text"])} for g in groups]


def parse_projects(lines: list[str]) -> list[dict]:
    """A non-bullet line with " | " (or the first line) starts a project; bullets follow."""
    projects: list[dict] = []
    for line in lines:
        if BULLET.match(line):
            if projects:
                projects[-1]["_lines"].append(line)
            continue
        if " | " not in line and projects and projects[-1]["_lines"]:
            projects[-1]["_lines"].append(line)  # a wrapped bullet
            continue
        title, *stack = re.split(r"\s+\|\s+", line.strip())
        links = re.findall(r"\[(\w+)\]", title)
        title = re.sub(r"\s*\[\w+\]", "", title).strip()
        name, _, subtitle = title.partition(":")
        if len(stack) == 1:
            stack = split_top_level(stack[0])
        projects.append({"name": name.strip(), "subtitle": subtitle.strip(), "links": links,
                         "stack": [x.strip() for x in stack if x.strip()], "_lines": []})
    for project in projects:
        project["bullets"] = bullets(project.pop("_lines"))
    return projects


def parse_text(text: str) -> dict:
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    if len(lines) < 5:
        raise ResumeError("the PDF has almost no extractable text")
    parts = sections(lines)
    header = parts.get("header", [])
    resume = {
        "name": header[0].strip() if header else "",
        "contact": parse_contact(header[1]) if len(header) > 1 else {},
        "summary": " ".join(ln.strip() for ln in parts.get("summary", [])),
        "education": parse_education(parts.get("education", [])),
        "skills": parse_skills(parts.get("skills", [])),
        "experience": parse_experience(parts.get("experience", [])),
        "projects": parse_projects(parts.get("projects", [])),
    }
    problems = []
    if not resume["name"]:
        problems.append("no name on the first line")
    if not resume["experience"] or not all(j["bullets"] for j in resume["experience"]):
        problems.append("EXPERIENCE is missing, or an entry has no bullets")
    if not resume["education"]:
        problems.append("EDUCATION is missing or has no dates")
    if problems:
        raise ResumeError("; ".join(problems))
    return resume


def main(pdf: str, out: str) -> None:
    from pypdf import PdfReader

    data = Path(pdf).read_bytes()
    text = "\n".join(page.extract_text() or "" for page in PdfReader(pdf).pages)
    try:
        resume = parse_text(text)
    except ResumeError as exc:
        print(f"::error file={pdf}::Could not read the resume: {exc}", file=sys.stderr)
        sys.exit(1)
    resume["source"] = {"file": Path(pdf).name, "sha256": hashlib.sha256(data).hexdigest()[:16]}
    Path(out).write_text(json.dumps(resume, indent=2, ensure_ascii=False) + "\n")
    print(f"Parsed {pdf}: {len(resume['experience'])} roles, {len(resume['projects'])} projects, "
          f"{sum(len(g['items']) for g in resume['skills'])} skills.")


if __name__ == "__main__":
    main(*(sys.argv[1:3] if len(sys.argv) >= 3 else ("assets/resume.pdf", "data/resume.json")))
