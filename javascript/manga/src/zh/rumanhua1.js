const mangayomiSources = [{
  "name": "如漫画",
  "lang": "zh",
  "baseUrl": "https://m.rumanhua1.com",
  "iconUrl": "https://i.ibb.co/TDfbbwDB/Untitled-design.png",
  "typeSource": "single",
  "itemType": 0,
  "version": "0.2.1",
  "pkgPath": "manga/src/zh/rumanhua1.js"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getHeaders() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
  }

  get supportsLatest() { return true; }

  async getPopular() {
    const res = await this.client.get("https://www.rumanhua1.com/rank/1", this.getHeaders());
    const doc = new Document(res.body);
    const list = [];
    for (const el of doc.select(".likedata")) {
      const a = el.selectFirst("a");
      if (!a) continue;
      const url = "/" + a.attr("href").replace(/^\/|\/$/g, "") + "/";
      let img = el.selectFirst("img")?.attr("data-src") || "";
      if (img.startsWith("//")) img = "https:" + img;
      list.push({
        name: el.selectFirst(".le-t")?.text || "",
        imageUrl: img,
        link: url,
        author: el.selectFirst(".likeinfo > p")?.text.replace("作者：", "") || "",
        description: el.selectFirst(".le-j")?.text || ""
      });
    }
    return { list, hasNextPage: false };
  }

  async getLatestUpdates() {
    const res = await this.client.get("https://www.rumanhua1.com/rank/5", this.getHeaders());
    const doc = new Document(res.body);
    const list = [];
    for (const el of doc.select(".likedata")) {
      const a = el.selectFirst("a");
      if (!a) continue;
      const url = "/" + a.attr("href").replace(/^\/|\/$/g, "") + "/";
      let img = el.selectFirst("img")?.attr("data-src") || "";
      if (img.startsWith("//")) img = "https:" + img;
      list.push({
        name: el.selectFirst(".le-t")?.text || "",
        imageUrl: img,
        link: url,
        author: el.selectFirst(".likeinfo > p")?.text.replace("作者：", "") || ""
      });
    }
    return { list, hasNextPage: false };
  }

  async search(query) {
    if (!query) return await this.getPopular();
    const res = await this.client.post("https://www.rumanhua1.com/s",
      { "Content-Type": "application/x-www-form-urlencoded" },
      `k=${encodeURIComponent(query.substring(0,12))}`);
    const doc = new Document(res.body);
    const list = [];

    for (const el of doc.select(".item-data .col-auto")) {
      const a = el.selectFirst("a");
      if (!a) continue;
      const url = "/" + a.attr("href").replace(/^\/|\/$/g, "") + "/";
      let img = el.selectFirst("img")?.attr("data-src") || "";
      if (img.startsWith("//")) img = "https:" + img;
      list.push({
        name: el.selectFirst(".e-title, .title")?.text || "",
        imageUrl: img,
        link: url,
        author: el.selectFirst(".tip")?.text || ""
      });
    }
    return { list, hasNextPage: false };
  }

  async getDetail(url) {
    const mangaId = url.replace(/^\/|\/$/g, "");
    const res = await this.client.get(`https://www.rumanhua1.com/${mangaId}/`, this.getHeaders());
    const doc = new Document(res.body);
    const info = doc.selectFirst(".comicInfo");
    if (!info) return { chapters: [] };

    let img = info.selectFirst("img")?.attr("data-src") || "";
    if (img.startsWith("//")) img = "https:" + img;

    const detContainer = info.selectFirst(".detinfo");
    const title = detContainer?.selectFirst("h1")?.text || "";
    let author = "", genres = [], status = 0, updated = "", contentDesc = "";

    if (detContainer) {
      contentDesc = detContainer.selectFirst(".content")?.text || "";
      for (const span of detContainer.select("span")) {
        const txt = span.text.trim();
        if (txt.startsWith("作  者："))
          author = txt.replace("作  者：", "").trim();
        else if (txt.startsWith("状  态："))
          status = txt.includes("连载") ? 0 : 1;
        else if (txt.startsWith("标  签："))
          genres = txt.replace("标  签：", "").trim().split(/\s+/).filter(Boolean);
        else if (/更新/.test(txt))
          updated = txt;
      }
    }

    let chapters = [];
    const chapterContainer = doc.selectFirst(".chapterlistload");
    if (chapterContainer) {
      const chapterElements = chapterContainer.select("ul a");
      for (const element of chapterElements) {
        const href = element.attr("href");
        if (href) {
          chapters.push({
            name: element.text.trim(),
            url: href.replace(/^\/|\/$/g, "").replace(/\.html$/, "")
          });
        }
      }

      if (chapterContainer.selectFirst(".chaplist-more")) {
        const moreRes = await this.client.post(
          `https://www.rumanhua1.com/morechapter`,
          { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          `id=${encodeURIComponent(mangaId)}`
        );
        const parsed = JSON.parse(moreRes.body);
        if (parsed && parsed.code === "200" && Array.isArray(parsed.data)) {
          chapters.push(...parsed.data.map(c => ({
            name: c.chaptername || "",
            url: c.chapterid || ""
          })));
        }
      }
    }

    const description = (contentDesc || "") + (updated ? ("\n" + updated) : "");
    return {
      name: title,
      imageUrl: img,
      description,
      genre: genres,
      author,
      status,
      chapters
    };
  }

  async getPageList(mangaId) {
    const res = await this.client.get(`http://m.rumanhua1.com/${mangaId}.html`, this.getHeaders());
    const doc = new Document(res.body);

    const scripts = doc.select("script[type='text/javascript']");

    let obfuscatedScript = null;
    for (const script of scripts) {
      const scriptText = script.text;
      if (scriptText.includes("eval(function(p,a,c,k,e,d")) {
        obfuscatedScript = scriptText;
        break;
      }
    }

    if (!obfuscatedScript) {
      console.error('No obfuscated script found.');
      return [];
    }

    const unpackedCode = unpack(obfuscatedScript);
    const match = unpackedCode.match(/var\s+\w+\s*=\s*["']([\s\S]*?)["'];?/);
    const encrypted = match ? match[1] : null;

    if (encrypted) {
      const decodedData = decrypt(encrypted, parseInt(doc.selectFirst(".readerContainer")?.attr("data-id") || "0"));
      return JSON.parse(decodedData);
    }

    console.error('No encrypted data found.');
    return [];
  }

}

function main(source) {
  const ext = new DefaultExtension();
  ext.source = source;
  return ext;
}

function base64Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = chars.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >>> bits) & 0xFF);
    }
  }
  return output;
}

function decrypt(data, index) {
  const keys = [
    "smkhy258",
    "smkd95fv",
    "md496952",
    "cdcsdwq",
    "vbfsa256",
    "cawf151c",
    "cd56cvda",
    "8kihnt9",
    "dso15tlo",
    "5ko6plhy"
  ];
  const key = keys[index];
  if (!key) throw new Error("Unknown index: " + index);
  const keyBytes = key.split('').map(c => c.charCodeAt(0));
  const keyLength = keyBytes.length;
  const decoded = base64Decode(data);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] ^= keyBytes[i % keyLength];
  }
  return base64Decode(String.fromCharCode(...bytes));
}

class Unbaser {
  constructor(base) {
    this.ALPHABET = {
      62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
    };
    this.dictionary = {};
    this.base = base;
    if (36 < base && base < 62) {
      this.ALPHABET[base] = this.ALPHABET[base] ||
        this.ALPHABET[62].substr(0, base);
    }
    if (2 <= base && base <= 36) {
      this.unbase = (value) => parseInt(value, base);
    }
    else {
      try {
        [...this.ALPHABET[base]].forEach((cipher, index) => {
          this.dictionary[cipher] = index;
        });
      }
      catch (er) {
        throw Error("Unsupported base encoding.");
      }
      this.unbase = this._dictunbaser;
    }
  }
  _dictunbaser(value) {
    let ret = 0;
    [...value].reverse().forEach((cipher, index) => {
      ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
    });
    return ret;
  }
}

function detect(source) {
  return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
  let { payload, symtab, radix, count } = _filterargs(source);
  if (count != symtab.length) {
    throw Error("Malformed p.a.c.k.e.r. symtab.");
  }
  let unbase;
  try {
    unbase = new Unbaser(radix);
  }
  catch (e) {
    throw Error("Unknown p.a.c.k.e.r. encoding.");
  }
  function lookup(match) {
    const word = match;
    let word2;
    if (radix == 1) {
      word2 = symtab[parseInt(word)];
    }
    else {
      word2 = symtab[unbase.unbase(word)];
    }
    return word2 || word;
  }
  source = payload.replace(/\b\w+\b/g, lookup);
  return _replacestrings(source);
  function _filterargs(source) {
    const juicers = [
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
    ];
    for (const juicer of juicers) {
      const args = juicer.exec(source);
      if (args) {
        let a = args;
        if (a[2] == "[]") {
        }
        try {
          return {
            payload: a[1],
            symtab: a[4].split("|"),
            radix: parseInt(a[2]),
            count: parseInt(a[3]),
          };
        }
        catch (ValueError) {
          throw Error("Corrupted p.a.c.k.e.r. data.");
        }
      }
    }
    throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
  }
  function _replacestrings(source) {
    return source;
  }
}
