"""Fetch a user-supplied web page without letting it reach internal addresses."""
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx

MAX_REDIRECTS = 4
MAX_BYTES = 2_000_000


class UnsafeUrlError(ValueError):
    """The URL is not a public http(s) address."""


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UnsafeUrlError("Only http and https links are supported")

    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 80, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeUrlError("Could not resolve that address") from exc

    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise UnsafeUrlError("That address is not publicly reachable")


async def fetch_public_text(url: str, timeout: float = 20.0) -> str:
    """GET a public page and return its body. Every redirect hop is checked too."""
    current = url
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            assert_public_url(current)
            resp = await client.get(current)
            if resp.is_redirect and resp.headers.get("location"):
                current = urljoin(current, resp.headers["location"])
                continue
            resp.raise_for_status()
            return resp.text[:MAX_BYTES]
    raise UnsafeUrlError("Too many redirects")
