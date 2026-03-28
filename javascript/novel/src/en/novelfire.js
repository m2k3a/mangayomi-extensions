const mangayomiSources = [{
    "name": "NovelFire",
    "lang": "en",
    "baseUrl": "https://novelfire.net",
    "apiUrl": "",
    "iconUrl": "https://m.media-amazon.com/images/I/31957gKv8WL.jpg",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.1",
    "pkgPath": "",
    "notes": ""
}];

class DefaultExtension extends MProvider {
    getHeaders(url) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        };
    }
    
    async getBooks(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        // get every book and its cover
        const bookList = [];
        const books = doc.select('ul.novel-list li.novel-item');
        for (const book of books) {
            const bookAncher = book.selectFirst('a');
            const bookTitle = bookAncher.attr("title");
            const bookLink = `${this.source.baseUrl}${bookAncher.attr("href")}`;
            const bookImg = book.selectFirst('figure.novel-cover img');
            const imgAttr = bookImg.attr("data-src") || bookImg.attr("src");
            const imageUrl = imgAttr.startsWith('http') ? imgAttr : `${this.source.baseUrl}${imgAttr}`;
          
            bookList.push({
                'name': bookTitle,
                'link': bookLink,
                'imageUrl': imageUrl
            })
        } 
        
        const nextButton = doc.selectFirst("ul.pagination li.page-item:last-child a");
        let hasNextPage = false;
        const nextHref = nextButton.attr("href");
        if (nextHref && nextHref !== "#" && nextHref !== url) {
          hasNextPage = true;
        }
        
        return {'list': bookList, 'hasNextPage': hasNextPage};
    }
    
    async getPopular(page) {
        const baseUrl = this.source.baseUrl;
        const url = `${baseUrl}/genre-all/sort-popular/status-all/all-novel?page=${page}`
        return await this.getBooks(url);
    }
    get supportsLatest() {
        return true;
    }
    async getLatestUpdates(page) {
        const baseUrl = this.source.baseUrl;
        const url = `${baseUrl}/latest-release-novels?page=${page}`
        return await this.getBooks(url);
    }
    async search(query, page, filters) {
        const baseUrl = this.source.baseUrl;
        let searchUrl = `${baseUrl}/search?keyword=${query}&type=both&page=${page}`
        return await this.getBooks(searchUrl);
    }
    async getDetail(url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        // title
        const bookTitle = doc.selectFirst("div.main-head h1.novel-title").text;
        
        // img
        const imgLink = doc.selectFirst("figure.cover img").attr("src");
        
        // description
        const bookDescription = doc.selectFirst('meta[itemprop="description"]').attr("content");
        
        // author
        const bookAuthor = doc.selectFirst('span[itemprop="author"]').text;
        
        // genres
        const keywords = doc.selectFirst('meta[itemprop="keywords"]').attr("content");
        const bookGenres = keywords ? keywords.split(',').map(g => g.trim()).filter(g => g.toLowerCase() !== 'novel' && g.toLowerCase() !== 'webnovel') : [];
    
        // status
        const statusText = doc.selectFirst("div.header-stats span strong").text.toLowerCase();
        const status = statusText.includes("ongoing") ? 1 : 0;
          
        // chapters
        let chaptersUrl = `${url}/chapters`;
        const chaptersList = [];
        
        while (chaptersUrl) {
          const chaptersRes = await client.get(chaptersUrl, this.getHeaders(chaptersUrl));
          const chaptersDoc = new Document(chaptersRes.body);
            
          const chapterElements = chaptersDoc.select("ul.chapter-list li a");
          
          for (const element of chapterElements) {
            const chapterTitle = element.selectFirst("strong.chapter-title").text.trim();
            const chapterNum = element.selectFirst("span.chapter-no").text;
            const chapterUrl = `${url}/chapter-${chapterNum}`;
            
            chaptersList.push({
              'name': chapterTitle,
              'url': chapterUrl,
              'scanlator': ""
            });
          }
          
          const nextButton = chaptersDoc.selectFirst("ul.pagination li.page-item a[rel='next']");
          const nextHref = nextButton.attr("href");
          if (nextHref && nextHref !== "#" && nextHref !== chaptersUrl) {
            chaptersUrl = nextHref.startsWith('http') ? nextHref : `${this.source.baseUrl}${nextHref}`;
          } else {
            chaptersUrl = null;
          }
        }
    
    
        // return all the gathered info
        return {
          'name': bookTitle,
          'link': url,
          'imageUrl': imgLink,
          'description': bookDescription,
          'author': bookAuthor,
          'genre': bookGenres,
          'status': status,
          'chapters': chaptersList.reverse()
        }
    }
    // For novel html content
    async getHtmlContent(name, url) {
        const client = new Client();
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const chapterContent = doc.selectFirst("div#content");
        return chapterContent.outerHtml;
    }
    // Clean html up for reader
    async cleanHtmlContent(html) {
        const doc = new Document(html);
        
        const content = doc.selectFirst("div#content");
        if (!content) return html;

        // Get all paragraphs
        const paragraphs = content.select("p");
        let cleanedHtml = "";

        for (const p of paragraphs) {
            const pText = p.text;
            
            // Skip the credits paragraph
            if (pText.includes("Translator:") || pText.includes("Editor:")) {
                continue;
            }

            // Append the outer HTML
            cleanedHtml += p.outerHtml;
        }

        return cleanedHtml;
    }
    getFilterList() {
        throw new Error("getFilterList not implemented");
    }
    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}
