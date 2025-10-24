const mangayomiSources = [{
  "name": "包子漫画",
  "lang": "zh",
  "baseUrl": "https://www.baozimh.com",
  "apiUrl": "",
  "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/zh.baozimh.png",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgName": "manga/src/zh/baozimh.js"
}];

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
  getHeaders(url) {
    return {
      "User-Agent": USER_AGENT,
      "Referer": this.source.baseUrl + "/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1"
    };
  }
  extractMangaList(doc) {
    const elements = doc.select("div.pure-g div a.comics-card__poster");
    const mangas = [];
    for (const el of elements) {
      const title = el.attr("title");
      const link = el.attr("href");
      const image = el.selectFirst("> amp-img").attr("src");
      mangas.push({
        name: title,
        link: link,
        imageUrl: image
      });
    }
    return {
      list: mangas,
      hasNextPage: elements.length > 0
    };
  }

  async getPopular(page) {
    const url = `${this.source.baseUrl}/classify?page=${page}`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this.extractMangaList(new Document(res.body));
  }

  get supportsLatest() {
    return true;
  }

  async getLatestUpdates(page) {
    const url = `${this.source.baseUrl}/list/new?page=${page}`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this.extractMangaList(new Document(res.body));
  }

  async search(query, page, filters) {
    const url = query
      ? `${this.source.baseUrl}/search?q=${encodeURIComponent(query)}`
      : `${this.source.baseUrl}/classify?page=${page}`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this.extractMangaList(new Document(res.body));
  }

  async getDetail(url) {
    if (!url.startsWith("http")) url = this.source.baseUrl + url;
    const res = await new Client().get(url, this.getHeaders(url));
    const doc = new Document(res.body);
    const name = doc.selectFirst("h1.comics-detail__title").text;
    const author = doc.selectFirst("h2.comics-detail__author").text;
    const desc = doc.selectFirst("p.comics-detail__desc").text;
    const image = doc.selectFirst("amp-img[alt='" + name + "']").attr("src");
    const tag = doc.selectFirst("span.tag").text;
    const status = (tag === "连载中" || tag === "連載中") ? 0 : (tag === "已完结" || tag === "已完結") ? 1 : 2;
    const elements = doc.select("a.comics-chapters__item");
    const chapters = [];
    for (const el of elements) {
      const title = el.selectFirst("span").text;
      const href = el.attr("href");
      if (href) {
        chapters.push({
          name: title,
          url: this.source.baseUrl + href
        });
      }
    }
    return {
      name: name,
      imageUrl: image,
      description: desc,
      author: author,
      status: status,
      episodes: chapters
    };
  }

  async getPageList(url) {
    if (!url.startsWith("http")) url = this.source.baseUrl + url;
    const res = await new Client().get(url, this.getHeaders(url));
    const doc = new Document(res.body);
    const pages = [];
    const imgs = doc.select(".comic-contain amp-img");
    for (const img of imgs) {
      const src = img.attr("src");
      if (src) pages.push(src);
    }
    return pages;
  }
}