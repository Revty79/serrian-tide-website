import http.server
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from bootstrap_tls_fixture import OwnedTLSProxy


class TLSFixtureTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("openssl"), "Owned TLS certificate generation requires OpenSSL")
    def test_verified_tls_forwarding_and_real_cookie_host_boundaries(self):
        class Echo(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                data = json.dumps({"host": self.headers["Host"], "proto": self.headers.get("X-Forwarded-Proto"), "cookie": self.headers.get("Cookie")}).encode()
                self.send_response(200)
                self.send_header("Set-Cookie", "fixture=value; HttpOnly; SameSite=Lax; Path=/")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Echo)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="serrian-owned-tls-unit-") as directory:
                origins = ["https://one-test.trycloudflare.com", "https://two-test.trycloudflare.com"]
                proxy = OwnedTLSProxy(Path(directory), origins, "http://198.51.100.10:3003", server.server_port)
                try:
                    client, cookies = proxy.client()
                    first = json.load(client.open(origins[0] + "/"))
                    self.assertEqual(first, {"host": "one-test.trycloudflare.com", "proto": "https", "cookie": None})
                    repeated = json.load(client.open(origins[0] + "/"))
                    self.assertEqual(repeated["cookie"], "fixture=value")
                    other = json.load(client.open(origins[1] + "/"))
                    self.assertIsNone(other["cookie"])
                    self.assertTrue(all(not cookie.domain_specified and cookie.has_nonstandard_attr("HttpOnly") for cookie in cookies))
                    public = json.load(client.open("http://198.51.100.10:3003/"))
                    self.assertEqual(public["host"], "198.51.100.10:3003")
                    self.assertIsNone(public["cookie"])
                finally:
                    proxy.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=10)


if __name__ == "__main__":
    unittest.main()
