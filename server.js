const express = require("express");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing ?url= parameter");

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      const buffer = Buffer.from(await response.arrayBuffer());
      for (const [key, value] of response.headers) {
        if (!["content-encoding", "content-length", "transfer-encoding"].includes(key)) {
          res.setHeader(key, value);
        }
      }
      return res.send(buffer);
    }

    let html = await response.text();
    const baseUrl = new URL(targetUrl);

    html = rewriteHtml(html, baseUrl);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
});

function rewriteHtml(html, baseUrl) {
  const $ = cheerio.load(html);

  $("head").prepend(`<base href="${escapeHtml(baseUrl.href)}">`);

  const rewriteAttrs = {
    a: "href",
    link: "href",
    img: "src",
    script: "src",
    iframe: "src",
    source: "src",
    video: "src",
    audio: "src",
    embed: "src",
    object: "data",
    form: "action",
  };

  for (const [tag, attr] of Object.entries(rewriteAttrs)) {
    $(tag).each((_, el) => {
      const val = $(el).attr(attr);
      if (val && !val.startsWith("#") && !val.startsWith("javascript:")) {
        try {
          const absolute = new URL(val, baseUrl).href;
          $(el).attr(attr, `/proxy?url=${encodeURIComponent(absolute)}`);
        } catch {
          // skip invalid URLs
        }
      }
    });
  }

  $("*").each((_, el) => {
    const style = $(el).attr("style");
    if (style && style.includes("url(")) {
      const newStyle = style.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (match, url) => {
        try {
          const absolute = new URL(url, baseUrl).href;
          return `url('/proxy?url=${encodeURIComponent(absolute)}')`;
        } catch {
          return match;
        }
      });
      $(el).attr("style", newStyle);
    }
  });

  return $.html();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.listen(PORT, () => {
  console.log(`Fake Google Docs running on http://localhost:${PORT}`);
});
