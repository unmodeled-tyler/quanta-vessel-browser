from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

HOST = "127.0.0.1"
PORT = 60551


def html(title: str, body: str) -> bytes:
    return f"<!doctype html><html><head><meta charset='utf-8'><title>{title}</title></head><body>{body}</body></html>".encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send(self, content: bytes, status: int = 200, content_type: str = "text/html; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _nav(self) -> str:
        return """
        <nav>
          <a href='/'>Home</a> |
          <a href='/anchor-source'>Anchor test</a> |
          <a href='/js-source'>JS test</a> |
          <a href='/get-form'>GET form</a> |
          <a href='/post-form'>POST form</a> |
          <a href='/external-submit'>External submit</a>
        </nav>
        <hr />
        """

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/":
            body = self._nav() + "<h1>Vessel MCP Navigation Test Home</h1><p>Choose a scenario.</p>"
            return self._send(html("home", body))

        if path == "/anchor-source":
            body = self._nav() + "<h1>Anchor Source</h1><a href='/anchor-dest'>Go to Anchor Dest</a>"
            return self._send(html("anchor-source", body))

        if path == "/anchor-dest":
            body = self._nav() + "<h1>Anchor Destination</h1><p>Anchor nav landed.</p>"
            return self._send(html("anchor-dest", body))

        if path == "/js-source":
            body = self._nav() + "<h1>JS Source</h1><button onclick=\"window.location.href='/js-dest'\">Go to JS Dest</button>"
            return self._send(html("js-source", body))

        if path == "/js-dest":
            body = self._nav() + "<h1>JS Destination</h1><p>JS nav landed.</p>"
            return self._send(html("js-dest", body))

        if path == "/get-form":
            body = self._nav() + """
            <h1>GET Form</h1>
            <form action='/get-result' method='get'>
              <label>Query <input name='q' value='' /></label>
              <button type='submit'>Submit GET</button>
            </form>
            """
            return self._send(html("get-form", body))

        if path == "/get-result":
            q = params.get("q", [""])[0]
            body = self._nav() + f"<h1>GET Result</h1><p id='value'>q={q}</p>"
            return self._send(html("get-result", body))

        if path == "/post-form":
            body = self._nav() + """
            <h1>POST Form</h1>
            <form action='/post-result' method='post'>
              <label>Query <input name='q' value='' /></label>
              <button type='submit'>Submit POST</button>
            </form>
            """
            return self._send(html("post-form", body))

        if path == "/post-result":
            q = params.get("q", [""])[0]
            body = self._nav() + f"<h1>POST Result</h1><p id='value'>q={q}</p>"
            return self._send(html("post-result", body))

        if path == "/external-submit":
            body = self._nav() + """
            <h1>External Submit</h1>
            <form id='search' action='/wrong-target' method='get'>
              <label>Wrong <input name='wrong' value='wrong' /></label>
              <button>Go Bare</button>
            </form>
            <form id='external' action='/external-result' method='get'>
              <label>Topic <input name='topic' value='' /></label>
            </form>
            <button form='external'>External Bare Submit</button>
            """
            return self._send(html("external-submit", body))

        if path == "/external-result":
            topic = params.get("topic", [""])[0]
            body = self._nav() + f"<h1>External Result</h1><p id='value'>topic={topic}</p>"
            return self._send(html("external-result", body))

        if path == "/wrong-target":
            wrong = params.get("wrong", [""])[0]
            body = self._nav() + f"<h1>Wrong Target</h1><p id='value'>wrong={wrong}</p>"
            return self._send(html("wrong-target", body))

        return self._send(html("not-found", self._nav() + f"<h1>404</h1><p>{path}</p>"), status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        params = parse_qs(raw)

        if path == "/post-result":
            q = params.get("q", [""])[0]
            location = "/post-result?" + urlencode({"q": q})
            self.send_response(303)
            self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        return self._send(html("not-found", self._nav() + f"<h1>404</h1><p>{path}</p>"), status=404)


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    print(f"serving http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
