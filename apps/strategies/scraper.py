import requests
from bs4 import BeautifulSoup


def _clean_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def _scrape_webpage(url: str) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    return _clean_text(text)


def _pick_best_transcript(transcript_list):
    """
    Return the best available transcript object.
    Prefers manually created over auto-generated; any language is fine.
    """
    manual = None
    generated = None
    for t in transcript_list:
        is_gen = getattr(t, "is_generated", True)
        if not is_gen and manual is None:
            manual = t
        elif generated is None:
            generated = t
    chosen = manual or generated
    if chosen is None:
        raise ValueError("No transcripts available for this video")
    return chosen


def _scrape_youtube(url: str) -> str:
    from youtube_transcript_api import YouTubeTranscriptApi
    import re

    video_id_match = re.search(
        r"(?:v=|youtu\.be/|/embed/|/v/)([A-Za-z0-9_-]{11})", url
    )
    if not video_id_match:
        raise ValueError(f"Could not extract YouTube video ID from URL: {url}")

    video_id = video_id_match.group(1)

    if hasattr(YouTubeTranscriptApi, "list_transcripts"):
        # Old API (< 0.6.0) — class methods
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = _pick_best_transcript(transcript_list)
        fetched = transcript.fetch()
        text = " ".join(
            (entry.get("text") or entry.text if hasattr(entry, "text") else entry["text"])
            for entry in fetched
        )
    else:
        # New API (>= 0.6.0) — instance-based
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        transcript = _pick_best_transcript(transcript_list)
        fetched = transcript.fetch()
        text = " ".join(snippet.text for snippet in fetched)

    return _clean_text(text)


def _scrape_keywords(keywords: str) -> str:
    from duckduckgo_search import DDGS

    results_text = []
    with DDGS() as ddgs:
        results = list(ddgs.text(keywords, max_results=3))

    for result in results:
        href = result.get("href") or result.get("url", "")
        if not href:
            continue
        try:
            page_text = _scrape_webpage(href)
            results_text.append(f"[Source: {href}]\n{page_text}")
        except Exception:
            body = result.get("body", "")
            if body:
                results_text.append(f"[Source: {href}]\n{body}")

    return "\n\n---\n\n".join(results_text)


def scrape_source(source_type: str, input_value: str) -> str:
    """
    Returns raw text content of the strategy source.
    source_type: "youtube" | "webpage" | "keyword" | "text"
    input_value: URL for youtube/webpage, search terms for keyword,
                 or the raw pasted content itself (e.g. a Pine Script) for "text"
    """
    if source_type == "youtube":
        return _scrape_youtube(input_value)
    elif source_type == "webpage":
        return _scrape_webpage(input_value)
    elif source_type == "keyword":
        return _scrape_keywords(input_value)
    elif source_type == "text":
        return input_value  # already raw source text/code — nothing to fetch
    else:
        raise ValueError(f"Unknown source_type: {source_type}")
