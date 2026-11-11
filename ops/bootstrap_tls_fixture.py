"""Owned CI TLS reverse proxy; real HTTPS, verified certificates and host cookies.

All connections are explicitly mapped to newly owned loopback listeners. No DNS,
Cloudflare service, system trust store or owner host configuration is changed.
"""
import http.client
import http.cookiejar
import http.server
import json
import socket
import ssl
import subprocess
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from ubuntu_deploy import require


class OwnedTLSProxy:
    def __init__(self, directory, origins, public_origin, upstream_port=3003):
        self.origins = origins
        self.hosts = {urlsplit(origin).hostname for origin in origins}
        self.public_host = urlsplit(public_origin).hostname
        self.public_origin = public_origin
        self.upstream_port = upstream_port
        self.sessions = []
        certificate, key = directory / "proxy-cert.pem", directory / "proxy-key.pem"
        config = directory / "proxy-openssl.cnf"
        config.write_text("[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=Owned Bootstrap TLS\n")
        # An explicit owned config avoids depending on a machine OpenSSL config.
        generated = subprocess.run(["openssl", "req", "-config", config.as_posix(), "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key.as_posix(), "-out", certificate.as_posix(), "-addext", "subjectAltName=" + ",".join("DNS:" + host for host in sorted(self.hosts)), "-addext", "basicConstraints=critical,CA:TRUE"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        require(generated.returncode == 0, "OWNED_TLS_CERTIFICATE_FAILED: " + generated.stderr.decode(errors="replace")[-500:])
        key.chmod(0o600)
        hosts = self.hosts

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def forward(self):
                if self.headers.get("Host") not in hosts:
                    self.send_error(421)
                    return
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                headers = {key: value for key, value in self.headers.items() if key.lower() not in ("connection", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for")}
                headers.update({"X-Forwarded-Proto": "https", "X-Forwarded-Host": self.headers["Host"], "X-Forwarded-For": "127.0.0.1"})
                connection = http.client.HTTPConnection("127.0.0.1", upstream_port, timeout=20)
                try:
                    connection.request(self.command, self.path, body=body, headers=headers)
                    response = connection.getresponse()
                    content = response.read()
                    self.send_response(response.status)
                    for key, value in response.getheaders():
                        if key.lower() not in ("transfer-encoding", "connection", "content-length"):
                            self.send_header(key, value)
                    self.send_header("Content-Length", str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                finally:
                    connection.close()

            do_GET = forward
            do_POST = forward

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server_context.load_cert_chain(certificate, key)
        self.server.socket = server_context.wrap_socket(self.server.socket, server_side=True)
        self.port = self.server.server_address[1]
        self.context = ssl.create_default_context(cafile=str(certificate))
        require(self.context.check_hostname and self.context.verify_mode == ssl.CERT_REQUIRED, "TLS verification must remain enabled")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def client(self):
        port, hosts, context, public, upstream = self.port, self.hosts, self.context, self.public_host, self.upstream_port

        class TLSConnection(http.client.HTTPSConnection):
            def connect(self):
                require(self.host in hosts and not self._tunnel_host, "Only owned TLS fixture names may connect")
                raw = socket.create_connection(("127.0.0.1", port), timeout=self.timeout)
                self.sock = self._context.wrap_socket(raw, server_hostname=self.host)

        class TLSHandler(urllib.request.HTTPSHandler):
            def https_open(self, request):
                return self.do_open(TLSConnection, request, context=context)

        class PublicConnection(http.client.HTTPConnection):
            def connect(self):
                require(self.host == public and not self._tunnel_host, "Only the synthetic legacy public address may be mapped")
                self.sock = socket.create_connection(("127.0.0.1", upstream), timeout=self.timeout)

        class PublicHandler(urllib.request.HTTPHandler):
            def http_open(self, request):
                if urlsplit(request.full_url).hostname == public:
                    return self.do_open(PublicConnection, request)
                require(urlsplit(request.full_url).hostname in ("127.0.0.1",), "Fixture client cannot contact an unowned HTTP host")
                return super().http_open(request)

        cookies = http.cookiejar.CookieJar()
        return urllib.request.build_opener(urllib.request.ProxyHandler({}), TLSHandler(), PublicHandler(), urllib.request.HTTPCookieProcessor(cookies)), cookies

    @staticmethod
    def post(client, origin, path, payload, headers=None):
        request = urllib.request.Request(origin + "/api/auth/" + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "Origin": origin, **(headers or {})})
        return client.open(request, timeout=20)

    def establish_legacy_sessions(self, payload):
        for origin in [*self.origins, self.public_origin]:
            time.sleep(11)
            client, cookies = self.client()
            with self.post(client, origin, "sign-in/username", {"username": "BootstrapOwner", "password": payload["password"]}) as response:
                require(response.status == 200, "Legacy real proxy/public login failed")
                require(json.load(response).get("redirect") is False, "Password login unexpectedly redirected to canonical public HTTP")
            session = json.load(client.open(origin + "/api/auth/get-session"))
            tokens = [cookie for cookie in cookies if cookie.name == "better-auth.session_token"]
            require(len(tokens) == 1 and not tokens[0].domain_specified and tokens[0].domain == urlsplit(origin).hostname, "Cookie must remain host-only")
            require(tokens[0].has_nonstandard_attr("HttpOnly") and tokens[0].get_nonstandard_attr("SameSite").lower() == "lax", "Original cookie protections differ")
            # Explicitly record the existing mixed-HTTP mode. Do not call this a
            # Secure cookie or silently alter Better Auth's global cookie policy.
            require(not tokens[0].secure, "Unexpected legacy HTTP-base cookie mode")
            self.sessions.append((origin, client, cookies, session["session"]["id"]))

    def verify_transition(self, payload, lan_origin):
        for origin, client, cookies, identity in self.sessions[:2]:
            continued = json.load(client.open(origin + "/api/auth/get-session"))
            require(continued["session"]["id"] == identity and continued["user"]["id"] == "bootstrap-owner", "Existing TLS host session did not survive canonical base change")
            require(json.load(client.open(origin + "/api/worlds"))["worlds"] == [], "Authenticated TLS World reads changed")
            fresh, fresh_cookies = self.client()
            time.sleep(11)
            with self.post(fresh, origin, "sign-in/username", {"username": "BootstrapOwner", "password": payload["password"]}) as response:
                require(response.status == 200 and json.load(response).get("redirect") is False, "Fresh username login through TLS failed or redirected to LAN")
            require(json.load(fresh.open(origin + "/api/auth/get-session"))["user"]["id"] == "bootstrap-owner", "Fresh TLS cookie was not returned")
            require(all(not cookie.domain_specified and cookie.has_nonstandard_attr("HttpOnly") for cookie in fresh_cookies), "TLS host cookie attributes changed")
            # Existing cookies plus missing/foreign Origin must still fail CSRF.
            for headers in ({"Origin": "https://unapproved.example.invalid"}, {"Origin": "null"}):
                try:
                    self.post(client, origin, "sign-out", {}, headers)
                    raise AssertionError("TLS cookie CSRF guard accepted an unauthorized origin")
                except urllib.error.HTTPError as error:
                    require(error.code == 403, "TLS CSRF rejection changed")
            require(json.load(client.open(origin + "/api/auth/get-session"))["session"]["id"] == identity, "Rejected CSRF modified an existing session")

        # An old public-host cookie is not a cookie for either TLS hostname.
        public_origin, public_client, public_cookies, _identity = self.sessions[-1]
        require(json.load(public_client.open(self.origins[0] + "/api/auth/get-session")) is None, "Public host cookie incorrectly crossed to a tunnel")
        request = urllib.request.Request(lan_origin + "/api/auth/get-session")
        public_cookies.add_cookie_header(request)
        require(not request.has_header("Cookie"), "Public host cookie incorrectly crossed to LAN")
        time.sleep(11)
        try:
            self.post(public_client, public_origin, "sign-in/email", payload)
            raise AssertionError("Removed public HTTP Origin remained authorized")
        except urllib.error.HTTPError as error:
            require(error.code == 403, "Removed legacy origin denial changed")

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=10)
        require(not self.thread.is_alive(), "Owned TLS fixture did not stop")
