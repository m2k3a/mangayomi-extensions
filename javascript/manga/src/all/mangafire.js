const mangayomiSources = [
  {
    "name": "Mangafire",
    "langs": ["en", "ja", "fr", "es", "es-la", "pt", "pt-br"],
    "baseUrl": "https://mangafire.to",
    "apiUrl": "",
    "iconUrl": "https://mangafire.to/assets/sites/mangafire/favicon.png?v3",
    "typeSource": "single",
    "itemType": 0,
    "version": "0.2.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "manga/src/all/mangafire.js"
  }
];

class DefaultExtension extends MProvider {
  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  mangaListFromPage(res) {
    const doc = new Document(res.body);
    const elements = doc.select("div.unit");
    const list = [];

    for (const element of elements) {
      const name = element.selectFirst("div.info > a").text;
      const imageUrl = element.selectFirst("img").getSrc;
      const link = element.selectFirst("a").getHref;
      list.push({ name, imageUrl, link });
    }

    const hasNextPage = doc.selectFirst("li.page-item.active + li").text != "";
    return { "list": list, "hasNextPage": hasNextPage };
  }

  statusFromString(status) {
    return (
      {
        "Releasing": 0,
        "Completed": 1,
        "On_Hiatus": 2,
        "Discontinued": 3,
        "Unrealeased": 4,
      }[status] ?? 5
    );
  }

  parseDate(date) {
    const months = {
      "jan": "01",
      "feb": "02",
      "mar": "03",
      "apr": "04",
      "may": "05",
      "jun": "06",
      "jul": "07",
      "aug": "08",
      "sep": "09",
      "oct": "10",
      "nov": "11",
      "dec": "12",
    };
    date = date.toLowerCase().replace(",", "").split(" ");

    if (!(date[0] in months)) {
      return String(new Date().valueOf());
    }

    date[0] = months[date[0]];
    date = [date[2], date[0], date[1]];
    date = date.join("-");
    return String(new Date(date).valueOf());
  }

  async filterPage({ keyword = "", slug = "" } = {}) {
    var vrf = "";
    if (keyword != "") vrf = this.generate_vrf(keyword);

    slug = `keyword=${keyword}&${slug}`;
    if (vrf != "") slug += `&vrf=${vrf}`;

    const res = await new Client().get(`${this.source.baseUrl}/filter?${slug}`);
    return this.mangaListFromPage(res);
  }

  async getPopular(page) {
    return await this.filterPage({
      keyword: "",
      slug: `language=${this.source.lang}&sort=trending&page=${page}`,
    });
  }

  async getLatestUpdates(page) {
    return await this.filterPage({
      keyword: "",
      slug: `language=${this.source.lang}&sort=recently_updated&page=${page}`,
    });
  }

  async search(query, page, filters) {
    var slug = `language=${this.source.lang}&page=${page}`;

    // Search sometimes failed because filters were empty. I experienced this mostly on android...
    var isFiltersAvailable = filters || filters.length > 0;
    if (isFiltersAvailable) {
      for (const filter of filters[0].state) {
        if (filter.state == true) slug += `&type%5B%5D=${filter.value}`;
      }

      for (const filter of filters[1].state) {
        if (filter.state == 1) slug += `&genre%5B%5D=${filter.value}`;
        else if (filter.state == 2) slug += `&genre%5B%5D=-${filter.value}`;
      }

      // &genre_mode=and

      for (const filter of filters[2].state) {
        if (filter.state == true) slug += `&status%5B%5D=${filter.value}`;
      }

      slug += `&language=${this.source.lang}`;
      slug += `&minchap=${filters[3].values[filters[3].state].value}`;
      slug += `&sort=${filters[4].values[filters[4].state].value}`;
    }

    return await this.filterPage({
      keyword:query,
      slug,
    });
  }

  async getDetail(url) {
    url = url.replace(this.source.baseUrl, "");
    const viewType = this.getPreference("mangafire_pref_content_view");
    const id = url.split(".").pop();
    const detail = {};

    // extract info
    const infoUrl = this.source.baseUrl + url;
    const infoRes = await new Client().get(infoUrl);
    const infoDoc = new Document(infoRes.body);
    const info = infoDoc.selectFirst("div.info");
    const sidebar = infoDoc.select("aside.sidebar div.meta div");
    detail.name = info.selectFirst("h1").text;
    detail.status = this.statusFromString(info.selectFirst("p").text);
    detail.imageUrl = infoDoc.selectFirst("div.poster img").getSrc;
    detail.author = sidebar[0].selectFirst("a").text;
    detail.description = infoDoc.selectFirst("div#synopsis").text.trim();
    detail.genre = sidebar[2].select("a");
    detail.genre.forEach((e, i) => {
      detail.genre[i] = e.text;
    });

    // get chapter
    // /read/ is needed to get chapter details
    var vrfKey = `${id}@${viewType}@${this.source.lang}`;
    var vrf = this.generate_vrf(vrfKey);

    const chapterUrl =
      this.source.baseUrl +
      `/ajax/read/${id}/${viewType}/${this.source.lang}?vrf=${vrf}`;

    const idRes = await new Client().get(chapterUrl);
    const idDoc = new Document(JSON.parse(idRes.body).result.html);
    const ids = idDoc.select("a");

    var chapElements = null;
    if (viewType == "chapter") {
      // upload date is not present in volumes
      // /manga/ is needed to get chapter upload date
      const chapRes = await new Client().get(
        this.source.baseUrl +
        `/ajax/manga/${id}/${viewType}/${this.source.lang}?vrf=${vrf}`
      );
      const chapDoc = new Document(JSON.parse(chapRes.body).result);
      chapElements = chapDoc.selectFirst(".scroll-sm").children;
    }
    detail.chapters = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const name = id.text;
      const mangaId = id.attr("data-id");

      var scanlator = null;
      var dateUpload = null;
      if (viewType == "chapter") {
        // upload date is not present in volumes
        const chapElement = chapElements[i];
        var title = chapElement.selectFirst("a").attr("title").split(" - ");
        scanlator = title.length > 1 ? title[0] : "Vol 1";
        try {
          dateUpload = this.parseDate(
            chapElement.selectFirst("span + span").text
          );
        } catch (_) {
          dateUpload = null;
        }
      }

      const url = `${mangaId}`;
      detail.chapters.push({ name, url, dateUpload, scanlator });
    }
    return detail;
  }

  // For manga chapter pages
  async getPageList(url) {
    var chapid = url;
    const viewType = this.getPreference("mangafire_pref_content_view");

    var vrfKey = `${viewType}@${chapid}`;
    var vrf = this.generate_vrf(vrfKey);

    var url =
      this.source.baseUrl + `/ajax/read/${viewType}/${chapid}?vrf=${vrf}`;
    var res = await new Client().get(url);
    if (res.statusCode != 200) {
      url = url.replace("/volume/", "/chapter/");
      res = await new Client().get(url);
    }
    const data = JSON.parse(res.body);
    const pages = [];
    var hdr = { "Referer": this.source.baseUrl };
    data.result.images.forEach((img) => {
      pages.push({ url: img[0], headers: hdr });
    });
    return pages;
  }

  getFilterList() {
    return [
      {
        type_name: "GroupFilter",
        name: "Type",
        state: [
          ["Manga", "manga"],
          ["One-Shot", "one_shot"],
          ["Doujinshi", "doujinshi"],
          ["Novel", "novel"],
          ["Manhwa", "manhwa"],
          ["Manhua", "manhua"],
        ].map((x) => ({ type_name: "CheckBox", name: x[0], value: x[1] })),
      },
      {
        type_name: "GroupFilter",
        name: "Genre",
        state: [
          ["Action", "1"],
          ["Adventure", "78"],
          ["Avant Garde", "3"],
          ["Boys Love", "4"],
          ["Comedy", "5"],
          ["Demons", "77"],
          ["Drama", "6"],
          ["Ecchi", "7"],
          ["Fantasy", "79"],
          ["Girls Love", "9"],
          ["Gourmet", "10"],
          ["Harem", "11"],
          ["Horror", "530"],
          ["Isekai", "13"],
          ["Iyashikei", "531"],
          ["Josei", "15"],
          ["Kids", "532"],
          ["Magic", "539"],
          ["Mahou Shoujo", "533"],
          ["Martial Arts", "534"],
          ["Mecha", "19"],
          ["Military", "535"],
          ["Music", "21"],
          ["Mystery", "22"],
          ["Parody", "23"],
          ["Psychological", "536"],
          ["Reverse Harem", "25"],
          ["Romance", "26"],
          ["School", "73"],
          ["Sci-Fi", "28"],
          ["Seinen", "537"],
          ["Shoujo", "30"],
          ["Shounen", "31"],
          ["Slice of Life", "538"],
          ["Space", "33"],
          ["Sports", "34"],
          ["SuperPower", "75"],
          ["Supernatural", "76"],
          ["Suspense", "37"],
          ["Thriller", "38"],
          ["Vampire", "39"],
        ].map((x) => ({ type_name: "TriState", name: x[0], value: x[1] })),
      },
      {
        type_name: "GroupFilter",
        name: "Status",
        state: [
          ["Releasing", "releasing"],
          ["Completed", "completed"],
          ["Hiatus", "on_hiatus"],
          ["Discontinued", "discontinued"],
          ["Not Yet Published", "info"],
        ].map((x) => ({ type_name: "CheckBox", name: x[0], value: x[1] })),
      },
      {
        type_name: "SelectFilter",
        type: "length",
        name: "Length",
        values: [
          [">= 1 chapters", "1"],
          [">= 3 chapters", "3"],
          [">= 5 chapters", "5"],
          [">= 10 chapters", "10"],
          [">= 20 chapters", "20"],
          [">= 30 chapters", "30"],
          [">= 50 chapters", "50"],
        ].map((x) => ({ type_name: "SelectOption", name: x[0], value: x[1] })),
      },
      {
        type_name: "SelectFilter",
        type: "sort",
        name: "Sort",
        state: 3,
        values: [
          ["Added", "recently_added"],
          ["Updated", "recently_updated"],
          ["Trending", "trending"],
          ["Most Relevance", "most_relevance"],
          ["Name", "title_az"],
        ].map((x) => ({ type_name: "SelectOption", name: x[0], value: x[1] })),
      },
    ];
  }

  getSourcePreferences() {
    return [
      {
        key: "mangafire_pref_content_view",
        listPreference: {
          title: "View manga as",
          summary: "",
          valueIndex: 0,
          entries: ["Chapters", "Volumes"],
          entryValues: ["chapter", "volume"],
        },
      },
    ];
  }

  // Vrf generation.
  // Credits :- https://github.com/keiyoushi/extensions-source/pull/10988

  b64encode(data) {
    const keystr =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function atobLookup(chr) {
      const index = keystr.indexOf(chr);
      // Throw exception if character is not in the lookup string; should not be hit in tests
      return index < 0 ? undefined : index;
    }

    data = `${data}`;
    data = data.replace(/[ \t\n\f\r]/g, "");
    if (data.length % 4 === 0) {
      data = data.replace(/==?$/, "");
    }
    if (data.length % 4 === 1 || /[^+/0-9A-Za-z]/.test(data)) {
      return null;
    }
    let output = "";
    let buffer = 0;
    let accumulatedBits = 0;
    for (let i = 0; i < data.length; i++) {
      buffer <<= 6;
      buffer |= atobLookup(data[i]);
      accumulatedBits += 6;
      if (accumulatedBits === 24) {
        output += String.fromCharCode((buffer & 0xff0000) >> 16);
        output += String.fromCharCode((buffer & 0xff00) >> 8);
        output += String.fromCharCode(buffer & 0xff);
        buffer = accumulatedBits = 0;
      }
    }
    if (accumulatedBits === 12) {
      buffer >>= 4;
      output += String.fromCharCode(buffer);
    } else if (accumulatedBits === 18) {
      buffer >>= 2;
      output += String.fromCharCode((buffer & 0xff00) >> 8);
      output += String.fromCharCode(buffer & 0xff);
    }
    return output;
  }

  b64decode(s) {
    const keystr =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function btoaLookup(index) {
      if (index >= 0 && index < 64) {
        return keystr[index];
      }

      return undefined;
    }

    let i;
    s = `${s}`;
    for (i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) > 255) {
        return null;
      }
    }
    let out = "";
    for (i = 0; i < s.length; i += 3) {
      const groupsOfSix = [undefined, undefined, undefined, undefined];
      groupsOfSix[0] = s.charCodeAt(i) >> 2;
      groupsOfSix[1] = (s.charCodeAt(i) & 0x03) << 4;
      if (s.length > i + 1) {
        groupsOfSix[1] |= s.charCodeAt(i + 1) >> 4;
        groupsOfSix[2] = (s.charCodeAt(i + 1) & 0x0f) << 2;
      }
      if (s.length > i + 2) {
        groupsOfSix[2] |= s.charCodeAt(i + 2) >> 6;
        groupsOfSix[3] = s.charCodeAt(i + 2) & 0x3f;
      }
      for (let j = 0; j < groupsOfSix.length; j++) {
        if (typeof groupsOfSix[j] === "undefined") {
          out += "=";
        } else {
          out += btoaLookup(groupsOfSix[j]);
        }
      }
    }
    return out;
  }

  toBytes = (str) => Array.from(str, (c) => c.charCodeAt(0) & 0xff);
  fromBytes = (bytes) =>
    bytes.map((b) => String.fromCharCode(b & 0xff)).join("");

  rc4Bytes(key, input) {
    const s = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;

    // KSA
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key.charCodeAt(i % key.length)) & 0xff;
      [s[i], s[j]] = [s[j], s[i]];
    }

    // PRGA
    const out = new Array(input.length);
    let i = 0;
    j = 0;
    for (let y = 0; y < input.length; y++) {
      i = (i + 1) & 0xff;
      j = (j + s[i]) & 0xff;
      [s[i], s[j]] = [s[j], s[i]];
      const k = s[(s[i] + s[j]) & 0xff];
      out[y] = (input[y] ^ k) & 0xff;
    }
    return out;
  }

  // One generic “step” to remove repeated boilerplate.
  transform(input, initSeedBytes, prefixKeyString, prefixLen, schedule) {
    const out = [];
    for (let i = 0; i < input.length; i++) {
      if (i < prefixLen) out.push(prefixKeyString.charCodeAt(i) & 0xff);

      out.push(
        schedule[i % 10]((input[i] ^ initSeedBytes[i % 32]) & 0xff) & 0xff
      );
    }
    return out;
  }

  // 8-bit ops
  add8 = (n) => (c) => (c + n) & 0xff;
  sub8 = (n) => (c) => (c - n + 256) & 0xff;
  xor8 = (n) => (c) => (c ^ n) & 0xff;
  rotl8 = (n) => (c) => ((c << n) | (c >>> (8 - n))) & 0xff;

  base64UrlEncodeBytes(bytes) {
    const std = this.b64decode(this.fromBytes(bytes));
    return std.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  bytesFromBase64(b64) {
    return this.toBytes(this.b64encode(b64));
  }

  generate_vrf(input) {
    // Schedules for each step (10 ops each, indexed by i % 10)
    const scheduleC = [
      this.sub8(48),
      this.sub8(19),
      this.xor8(241),
      this.sub8(19),
      this.add8(223),
      this.sub8(19),
      this.sub8(170),
      this.sub8(19),
      this.sub8(48),
      this.xor8(8),
    ];

    const scheduleY = [
      this.rotl8(4),
      this.add8(223),
      this.rotl8(4),
      this.xor8(163),
      this.sub8(48),
      this.add8(82),
      this.add8(223),
      this.sub8(48),
      this.xor8(83),
      this.rotl8(4),
    ];

    const scheduleB = [
      this.sub8(19),
      this.add8(82),
      this.sub8(48),
      this.sub8(170),
      this.rotl8(4),
      this.sub8(48),
      this.sub8(170),
      this.xor8(8),
      this.add8(82),
      this.xor8(163),
    ];

    const scheduleJ = [
      this.add8(223),
      this.rotl8(4),
      this.add8(223),
      this.xor8(83),
      this.sub8(19),
      this.add8(223),
      this.sub8(170),
      this.add8(223),
      this.sub8(170),
      this.xor8(83),
    ];

    const scheduleE = [
      this.add8(82),
      this.xor8(83),
      this.xor8(163),
      this.add8(82),
      this.sub8(170),
      this.xor8(8),
      this.xor8(241),
      this.add8(82),
      this.add8(176),
      this.rotl8(4),
    ];
    // Constants — grouped logically and left as-is (base64) for clarity.
    const CONST = {
      "rc4Keys": {
        "l": "u8cBwTi1CM4XE3BkwG5Ble3AxWgnhKiXD9Cr279yNW0=",
        "g": "t00NOJ/Fl3wZtez1xU6/YvcWDoXzjrDHJLL2r/IWgcY=",
        "B": "S7I+968ZY4Fo3sLVNH/ExCNq7gjuOHjSRgSqh6SsPJc=",
        "m": "7D4Q8i8dApRj6UWxXbIBEa1UqvjI+8W0UvPH9talJK8=",
        "F": "0JsmfWZA1kwZeWLk5gfV5g41lwLL72wHbam5ZPfnOVE=",
      },
      "seeds32": {
        "A": "pGjzSCtS4izckNAOhrY5unJnO2E1VbrU+tXRYG24vTo=",
        "V": "dFcKX9Qpu7mt/AD6mb1QF4w+KqHTKmdiqp7penubAKI=",
        "N": "owp1QIY/kBiRWrRn9TLN2CdZsLeejzHhfJwdiQMjg3w=",
        "P": "H1XbRvXOvZAhyyPaO68vgIUgdAHn68Y6mrwkpIpEue8=",
        "k": "2Nmobf/mpQ7+Dxq1/olPSDj3xV8PZkPbKaucJvVckL0=",
      },
      "prefixKeys": {
        "O": "Rowe+rg/0g==",
        "v": "8cULcnOMJVY8AA==",
        "L": "n2+Og2Gth8Hh",
        "p": "aRpvzH+yoA==",
        "W": "ZB4oBi0=",
      },
    };

    // Stage 0: normalize to URI-encoded bytes
    let bytes = this.toBytes(encodeURIComponent(input));

    // RC4 1
    bytes = this.rc4Bytes(this.b64encode(CONST.rc4Keys.l), bytes);

    // Step C1
    bytes = this.transform(
      bytes,
      this.bytesFromBase64(CONST.seeds32.A),
      this.b64encode(CONST.prefixKeys.O),
      7,
      scheduleC
    );

    // RC4 2
    bytes = this.rc4Bytes(this.b64encode(CONST.rc4Keys.g), bytes);

    // Step Y
    bytes = this.transform(
      bytes,
      this.bytesFromBase64(CONST.seeds32.V),
      this.b64encode(CONST.prefixKeys.v),
      10,
      scheduleY
    );

    // RC4 3
    bytes = this.rc4Bytes(this.b64encode(CONST.rc4Keys.B), bytes);

    // Step B
    bytes = this.transform(
      bytes,
      this.bytesFromBase64(CONST.seeds32.N),
      this.b64encode(CONST.prefixKeys.L),
      9,
      scheduleB
    );

    // RC4 4
    bytes = this.rc4Bytes(this.b64encode(CONST.rc4Keys.m), bytes);

    // Step J
    bytes = this.transform(
      bytes,
      this.bytesFromBase64(CONST.seeds32.P),
      this.b64encode(CONST.prefixKeys.p),
      7,
      scheduleJ
    );

    // RC4 5
    bytes = this.rc4Bytes(this.b64encode(CONST.rc4Keys.F), bytes);

    // Step E
    bytes = this.transform(
      bytes,
      this.bytesFromBase64(CONST.seeds32.k),
      this.b64encode(CONST.prefixKeys.W),
      5,
      scheduleE
    );

    // Base64URL
    return this.base64UrlEncodeBytes(bytes);
  }
}
