// prettier-ignore
const mangayomiSources = [{
    "name": "TeamX",
    "lang": "ar",
    "baseUrl": "https://olympustaff.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://olympustaff.com",
    "typeSource": "single",
    "itemType": 0,
    "version": "0.1.0",
    "isNsfw": false,
    "pkgPath": "manga/src/ar/teamx.js"
}];

class DefaultExtension extends MProvider {
  //  Helper Methods
  toStatus(status) {
    return (
      {
        مستمرة: 0,
        مكتملة: 1,
        مكتمل: 1,
        متوقف: 2,
        متروك: 3,
        "قادم قريبًا": 4,
      }[status] ?? 5 // 5 => unknown
    );
  }

  hasNextPage(doc) {
    return (
      doc
        .selectFirst(".pagination li.page-item a[rel='next']")
        ?.attr("href") !== ""
    );
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (base_url.length == 0) {
      return this.source.baseUrl;
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  getHeaders(url) {
    url = url || this.getBaseUrl();
    return {
      Referer: `${url}/`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
  }

  async request(slug, useBaseUrl = true) {
    const url = useBaseUrl ? `${this.getBaseUrl()}${slug}` : slug;
    if (!this.client) {
      this.client = new Client();
    }
    let res = await this.client.get(url, { headers: this.getHeaders(url) });
    if (res && (res.statusCode === 503 || (res.body && res.body.indexOf('cf-browser-verification') !== -1) || (res.headers && res.headers['server'] && res.headers['server'].toLowerCase().includes('cloudflare')))) {
      const extraHeaders = Object.assign({}, this.getHeaders(url), { "Upgrade-Insecure-Requests": "1" });
      res = await this.client.get(url, { headers: extraHeaders });
    }
    return new Document(res.body);
  }

  //  Manga Listing
  async getMangaList(slug) {
    const doc = await this.request(`/${slug}`);
    const list = doc.select(".listupd .bsx").map((element) => ({
      name: element.selectFirst("a")?.attr("title")?.trim(),
      imageUrl: element.selectFirst("img")?.getSrc,
      link: element.getHref,
    }));

    return { list, hasNextPage: this.hasNextPage(doc) };
  }

  async getPopular(page) {
    return this.getMangaList(`series?page=${page}`);
  }

  async getLatestUpdates(page) {
    const doc = await this.request(`/?page=${page}`);
    const list = doc.select(".post-body .box").map((element) => ({
      name: element.selectFirst(".info a h3")?.text,
      imageUrl: element.selectFirst(".imgu img")?.getSrc,
      link: element.selectFirst(".imgu a")?.getHref,
    }));

    return { list, hasNextPage: this.hasNextPage(doc) };
  }

  //  Search
  async search(query, page, filters) {
    if (!query) {
      const [type, status, genre] = filters.map(
        (filter, i) => filter.values[filters[i].state]?.value,
      );
      return this.getMangaList(
        `series?page=${page}&genre=${genre}&type=${type}&status=${status}`,
      );
    }
    // /html/body/a[1]
    // body > a:nth-child(1)
    const doc = await this.request(`/ajax/search?keyword=${query}`);
    const list = doc.select("a").map((element) => ({
      name: element.selectFirst("h4")?.text.trim(),
      imageUrl: element.selectFirst("div img")?.getSrc,
      link: element?.getHref,
    }));

    return { list, hasNextPage: false };
  }

  //  Chapters
  chapterFromElement(element, mangaUrl, chapterNumber) {
    // #chaptersContainer > div:nth-child(1) > a > div.chapter-info > div.chapter-number
    const chpNum = element.selectFirst("div.chapter-info > div.chapter-number")?.text.trim();
    const chpTitle = element.selectFirst("div.chapter-info > div.chapter-title")?.text.trim();
    const date = element? element.attr("data-date") + "000" : "0";
    return {
      name: chpNum || `الفصل ${chapterNumber}`,
      description: chpTitle || "",
      dateUpload: date,
      url: element.selectFirst("a").getHref || `${mangaUrl}/${chapterNumber}`,
    };
  }

  //  Detail
  async getDetail(url) {
    let doc = await this.request(url, false);

    const title = doc.selectFirst("div.author-info-title h1")?.text.trim();
    const imageUrl = doc.selectFirst("img.shadow-sm")?.getSrc;
    const description = doc.selectFirst(".review-content > p")?.text.trim();

    const author = doc
      .selectFirst(
        ".full-list-info > small:first-child:contains(الرسام) + small",
      )
      ?.text?.trim();

    const status = this.toStatus(
      doc
        .selectFirst(
          ".full-list-info > small:first-child:contains(الحالة) + small",
        )
        ?.text?.trim(),
    );

    const genre = doc
      .select("div.review-author-info a")
      .map((e) => e.text.trim());



    var lastChapter = doc.selectFirst("#chapter-contact > div.lastend > div:nth-child(2) > a > span.epcur.epcurlast").text.trim().split(" ")[1];
    if (isNaN(lastChapter)) {
      lastChapter = "0";
    }
    var firstChapter = doc.selectFirst("#chapter-contact > div.lastend > div:nth-child(1) > a > span.epcur.epcurfirst").text.trim().split(" ")[1];
    if (isNaN(firstChapter)) {
      firstChapter = "0";
    }
    lastChapter = parseInt(lastChapter);
    firstChapter = parseInt(firstChapter);

    let i = lastChapter;
    const chapters = [];
    // this parses from high to low 
    const last100Chapters = doc.select("#chaptersContainer > div").map((e) =>
      this.chapterFromElement(e, url, i--),
    );
    chapters.push(...last100Chapters);
    for (; i >= firstChapter; i--) {
      chapters.push({
        name: `الفصل ${i}`,
        url: `${url}/${i}`,
        dateUpload: "0",
      });
    }
    return {
      title,
      imageUrl,
      description,
      author: author && author !== "غير معروف" ? author : null,
      status,
      genre,
      chapters,
    };
  }

  //  chapter pages
  async getPageList(url) {
    const doc = await this.request(url, false);

    // NOTE: even tho urls are correct
    // the images do not load in the reader directly due to cloudflare issue
    return doc.select("div.image_list img[src]").map((x) => ({
      url: x.attr("src"),
      headers: this.getHeaders(url),
    }));
  }

  //  Filter
  getFilterList() {
    return [
      {
        type_name: "SelectFilter",
        name: "النوع",
        values: [
          ["اختر النوع", ""],
          ["مانها صيني", "مانها صيني"],
          ["مانجا ياباني", "مانجا ياباني"],
          ["ويب تون انجليزية", "ويب تون انجليزية"],
          ["مانهوا كورية", "مانهوا كورية"],
          ["ويب تون يابانية", "ويب تون يابانية"],
          ["عربي", "عربي"],
        ].map((x) => ({
          type_name: "SelectOption",
          name: x[0],
          value: x[1],
        })),
      },
      {
        type_name: "SelectFilter",
        name: "الحالة",
        values: [
          ["اختر الحالة", ""],
          ["مستمرة", "مستمرة"],
          ["متوقف", "متوقف"],
          ["مكتمل", "مكتمل"],
          ["قادم قريبًا", "قادم قريبًا"],
          ["متروك", "متروك"],
        ].map((x) => ({
          type_name: "SelectOption",
          name: x[0],
          value: x[1],
        })),
      },
      {
        type_name: "SelectFilter",
        name: "التصنيف",
        values: [
          ["اختر التصنيف", ""],
          ["أكشن", "أكشن"],
          ["إثارة", "إثارة"],
          ["إيسيكاي", "إيسيكاي"],
          ["بطل غير إعتيادي", "بطل غير إعتيادي"],
          ["خيال", "خيال"],
          ["دموي", "دموي"],
          ["نظام", "نظام"],
          ["صقل", "صقل"],
          ["قوة خارقة", "قوة خارقة"],
          ["فنون قتال", "فنون قتال"],
          ["غموض", "غموض"],
          ["وحوش", "وحوش"],
          ["شونين", "شونين"],
          ["حريم", "حريم"],
          ["خيال علمي", "خيال علمي"],
          ["مغامرات", "مغامرات"],
          ["دراما", "دراما"],
          ["خارق للطبيعة", "خارق للطبيعة"],
          ["سحر", "سحر"],
          ["كوميدي", "كوميدي"],
          ["ويب تون", "ويب تون"],
          ["زمكاني", "زمكاني"],
          ["رومانسي", "رومانسي"],
          ["شياطين", "شياطين"],
          ["فانتازيا", "فانتازيا"],
          ["عنف", "عنف"],
          ["ملائكة", "ملائكة"],
          ["بعد الكارثة", "بعد الكارثة"],
          ["إعادة إحياء", "إعادة إحياء"],
          ["اعمار", "اعمار"],
          ["ثأر", "ثأر"],
          ["زنزانات", "زنزانات"],
          ["تاريخي", "تاريخي"],
          ["حرب", "حرب"],
          ["خارق", "خارق"],
          ["سنين", "سنين"],
          ["عسكري", "عسكري"],
          ["بوليسي", "بوليسي"],
          ["حياة مدرسية", "حياة مدرسية"],
          ["واقع افتراضي", "واقع افتراضي"],
          ["داخل لعبة", "داخل لعبة"],
          ["داخل رواية", "داخل رواية"],
          ["الحياة اليومية", "الحياة اليومية"],
          ["رعب", "رعب"],
          ["طبخ", "طبخ"],
          ["مدرسي", "مدرسي"],
          ["زومبي", "زومبي"],
          ["شوجو", "شوجو"],
          ["معالج", "معالج"],
          ["شريحة من الحياة", "شريحة من الحياة"],
          ["نفسي", "نفسي"],
          ["تاريخ", "تاريخ"],
          ["أكاديمية", "أكاديمية"],
          ["أرواح", "أرواح"],
          ["تراجيدي", "تراجيدي"],
          ["ابراج", "ابراج"],
          ["رياضي", "رياضي"],
          ["مصاص دماء", "مصاص دماء"],
          ["طبي", "طبي"],
          ["مأساة", "مأساة"],
          ["إيتشي", "إيتشي"],
          ["انتقام", "انتقام"],
          ["جوسي", "جوسي"],
          ["موريم", "موريم"],
          ["لعبة فيديو", "لعبة فيديو"],
          ["مغني", "مغني"],
          ["تشويق", "تشويق"],
          ["نجاة", "نجاة"],
          ["الجانب المظلم من الحياة", "الجانب المظلم من الحياة"],
          ["سينين", "سينين"],
          ["تنمر", "تنمر"],
          ["حيوانات أليفة", "حيوانات أليفة"],
          ["شرطة", "شرطة"],
          ["الخيال العلمي", "الخيال العلمي"],
          ["حشرات", "حشرات"],
          ["عوالم", "عوالم"],
          ["ممالك", "ممالك"],
          ["مؤامرات", "مؤامرات"],
          ["تخطيط", "تخطيط"],
          ["سفر عبر الأبعاد", "سفر عبر الأبعاد"],
          ["جواسيس", "جواسيس"],
          ["بطل مخطط", "بطل مخطط"],
          ["ممثل", "ممثل"],
        ].map((x) => ({
          type_name: "SelectOption",
          name: x[0],
          value: x[1],
        })),
      },
    ];
  }

  //  Preferences
  getSourcePreferences() {
    return [
      {
        key: "domain_url",
        editTextPreference: {
          title: "Override BaseUrl",
          summary: "",
          value: "https://olympustaff.com",
          dialogTitle: "URL",
          dialogMessage: "",
        },
      },
    ];
  }
}
