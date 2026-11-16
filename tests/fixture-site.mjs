// A small local website with known SEO problems, used to test the audit end to end.
// Start it with: node tests/fixture-site.mjs  (listens on http://127.0.0.1:4010)
import http from "node:http";

const PORT = Number(process.env.FIXTURE_PORT || 4010);
const page = ({ title, description, h1 = "Heading", body = "", head = "" }) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
${title ? `<title>${title}</title>` : ""}
${description ? `<meta name="description" content="${description}">` : ""}
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head><body>
${h1 ? `<h1>${h1}</h1>` : ""}
<nav><a href="/">Home</a> <a href="/services/ac-repair/">AC repair</a> <a href="/services/heating/">Heating</a> <a href="/about/">About</a> <a href="/old-page/">Old page</a> <a href="/moved/">Moved</a> <a href="/broken/">Broken</a></nav>
${body}
</body></html>`;

const words = (count) => Array.from({ length: count }, (_, i) => `word${i}`).join(" ");
const routes = {
  "/": () =>
    page({
      title: "Cool Air HVAC | AC Repair and Heating in Springfield Today",
      description: "Licensed and insured AC repair and heating service in Springfield. Same-day appointments, upfront pricing and a 100% satisfaction guarantee. Call now.",
      h1: "AC repair and heating in Springfield",
      head: `<link rel="canonical" href="http://127.0.0.1:${PORT}/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"HVACBusiness","name":"Cool Air"}</script>`,
      body: `<p>${words(300)} Read our reviews rated 4.9 stars. Call <a href="tel:+15551234567">555 123 4567</a>.</p><img src="/a.jpg" alt="Technician fixing an AC unit"><img src="/b.jpg"><a href="/deep/1/">Deep</a>`,
    }),
  "/services/ac-repair/": () =>
    page({
      title: "AC Repair",
      description: "Short.",
      body: `<p>${words(80)}</p><h2>How much does AC repair cost?</h2><p>It depends.</p><h2>Do you offer same-day service?</h2><p>Yes.</p><img src="/c.jpg">`,
      head: `<link rel="canonical" href="http://127.0.0.1:${PORT}/moved/">`,
    }),
  "/services/heating/": () => page({ title: "AC Repair", description: "Short.", h1: "", body: `<p>${words(250)}</p>` }),
  "/about/": () => page({ title: "About Cool Air HVAC: Family Owned Since 1998 in Springfield", description: null, body: `<p>${words(400)}</p>`, head: '<meta name="robots" content="noindex">' }),
  "/deep/1/": () => page({ title: "Deep 1", description: null, body: '<a href="/deep/2/">next</a>' }),
  "/deep/2/": () => page({ title: "Deep 2", description: null, body: '<a href="/deep/3/">next</a>' }),
  "/deep/3/": () => page({ title: "Deep 3", description: null, body: '<a href="/deep/4/">next</a>' }),
  "/deep/4/": () => page({ title: "Deep 4 is a long page title that goes well past the sixty character limit", description: null }),
  "/orphan/": () => page({ title: "Orphan page only listed in the sitemap for testing purposes", description: null }),
};

const server = http.createServer((req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("User-agent: *\nDisallow: /private/\n\nUser-agent: GPTBot\nDisallow: /\n");
  }
  if (path === "/sitemap.xml") {
    res.writeHead(200, { "content-type": "application/xml" });
    const locs = ["/", "/services/ac-repair/", "/broken/", "/orphan/", "/orphan/"].map((p) => `<url><loc>http://127.0.0.1:${PORT}${p}</loc></url>`);
    return res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.join("")}</urlset>`);
  }
  if (path === "/moved/") {
    res.writeHead(301, { location: "/services/heating/" });
    return res.end();
  }
  if (path === "/old-page/") {
    res.writeHead(500, { "content-type": "text/html" });
    return res.end("error");
  }
  const route = routes[path];
  if (!route) {
    res.writeHead(404, { "content-type": "text/html" });
    return res.end("<h1>Not found</h1>");
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(route());
});

server.listen(PORT, "127.0.0.1", () => console.log(`fixture site on http://127.0.0.1:${PORT}`));
