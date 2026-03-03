const mangayomiSources = [{
    "name": "bookReadFree",
    "lang": "en",
    "baseUrl": "https://bookreadfree.com",
    "apiUrl": "",
    "iconUrl": "https://cdn.pixabay.com/photo/2016/09/16/09/20/books-1673578_1280.png",
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
    async getPopular(page) {
        const baseUrl = this.source.baseUrl;
        const client = new Client();
        
        const res = await client.get(baseUrl, this.getHeaders(baseUrl));
        const doc = new Document(res.body);
        
        const books = doc.select("ul.l1 li");
        const bookList = [];

        if (books && books.length > 0) {
            for (const book of books) {
                const anchor = book.selectFirst("a");
                
                if (anchor) {
                    const bookRelPath = anchor.attr("href");
                    const bookTitle = anchor.text.trim();
                    const bookLink = bookRelPath.startsWith('http') ? bookRelPath : baseUrl + bookRelPath;
                    // The image are in its own page
                    const imageLink = await this.getImage(bookLink);
                    
                    bookList.push({
                        'name': bookTitle,
                        'link': bookLink,
                        'imageUrl': imageLink
                    });
                }
            } 
        }
          
        return {
            'list': bookList,
            'hasNextPage': false
        };
    }
    
    async getImage(url) {
      const client = new Client();
      const imageRes = await client.get(url, this.getHeaders(url));
      const imageDoc = new Document(imageRes.body);
      
      const image = imageDoc.selectFirst("img");
      const imageLink = image ? image.attr("src") : "";
      return imageLink;
    }
    get supportsLatest() {
        throw new Error("supportsLatest not implemented");
    }
    async getLatestUpdates(page) {
        const baseUrl = this.source.baseUrl;
        const client = new Client();
        
        const res = await client.get(baseUrl, this.getHeaders(baseUrl));
        const doc = new Document(res.body);
        
        const books = doc.select("ol.l2 p");
        const bookList = [];
                    
        if (books && books.length > 0) {
            for (const book of books) {
                const anchor = book.selectFirst("a");
                
                if (anchor) {
                    const bookRelPath = anchor.attr("href");
                    const bookTitle = anchor.text.trim();
                    if (bookTitle == "View More>>") {
                      continue
                    }
                    
                    const bookLink = bookRelPath.startsWith('http') ? bookRelPath : baseUrl + bookRelPath;
                    // The image are in its own page
                    const imageLink = await this.getImage(bookLink);
                    
                    bookList.push({
                        'name': bookTitle,
                        'link': bookLink,
                        'imageUrl': imageLink
                    });
                }  
            }
        }
        
        return {
          'list': bookList,
          'hasNextPage': false
        }
    }
    async search(query, page, filters) {
        const baseUrl = this.source.baseUrl;
        const encodedQuery = encodeURIComponent(query);
        let searchUrl = `${baseUrl}/s/search?q=${encodedQuery}`;
        if (page > 1) {
          searchUrl += `&offset=${page}`;
        }
        
        const client = new Client();
        const res = await client.get(searchUrl);
        
        const doc = new Document(res.body);
        const books = doc.select('ul.books li');
        const bookList = [];
        
        if (books && books.length > 0) {
          for (const book of books) {
            const anchor = book.selectFirst("a.row");
            if (anchor) {
              const bookRelPath = anchor.attr("href");
              const bookTitle = anchor.selectFirst("i.hh")?.text.trim() || "";
              const bookAuthor = anchor.selectFirst("b.auto")?.text.trim().replace(/^by\s+/i, "") || "";
              
              const coverDiv = anchor.selectFirst("div.a");
              const bookCover = coverDiv?.attr("src") || "";
              
              bookList.push({
                'name': bookTitle,
                'link': baseUrl + bookRelPath,
                'imageUrl': bookCover
              })
            }
          }
        }
        
        let hasNextPage = false;
        const moreElements = doc.select('a.more');
        for (const el of moreElements) {
          if (el.text == 'Next >') {
            hasNextPage = true;
          }
        }
        
        return {
          'list': bookList,
          'hasNextPage': hasNextPage
        }
    }
    async getDetail(url) {
        const client = new Client();
        
        // Get the DOM content of the book url
        const res = await client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        // Get title
        const titleElement = doc.selectFirst("div.d b.t");
        const bookTitle = titleElement ? titleElement.text.trim() : "Unknown Title";
        
        // Get author
        const authorElement = doc.selectFirst("div.d p:contains(by) a");
        const bookAuthor = authorElement ? authorElement.text.trim() : "";
        
        // Get description
        const descElement = doc.selectFirst("div.dd");
        let bookDescription = descElement ? descElement.text.trim() : "";
        bookDescription = bookDescription.replace(/Read .* Storyline:\s+/i, "");
        
        // Get genere(but the geners inside this extensions are bad so other12 and Science on The name of the wind is going to accure)
        const genreElement = doc.selectFirst("div.d p:contains(Genre)");
        let bookGenres = [];
        if (genreElement) {
            const genreText = genreElement.text.replace("Genre:", "").trim();
            bookGenres = genreText.split(',').map(g => g.trim());
        }
        
        // Get chapters
        const chaptersUrl = url.replace('/book/', '/all/');
        const chaptersRes = await client.get(chaptersUrl, this.getHeaders(chaptersUrl));
        const chaptersDoc = new Document(chaptersRes.body);
        
        const chaptersLinksElements = chaptersDoc.select("div.l a")
        const chaptersList = []
        
        if (chaptersLinksElements && chaptersLinksElements.length > 0) {
          for (const element of chaptersLinksElements) {
            const chapterName = element.text.trim();
            const chapterRelPath = element.attr("href");
            const chapterLink = chapterRelPath.startsWith('http') ? chapterRelPath : this.source.baseUrl + chapterRelPath;
            
            chaptersList.push({
              'name': chapterName,
              'url': chapterLink,
              'scanlator': "",
            })
          }
        }
        
        // Return all the info
        return {
          'name': bookTitle,
          'link': url,
          'imageUrl': await this.getImage(url),
          'description': bookDescription,
          'author': bookAuthor,
          'genre': bookGenres,
          'status': 1,
          'chapters': chaptersList
        }
    }
    // For novel html content
    async getHtmlContent(name, url) {
       const client = new Client();
       const res = await client.get(url, this.getHeaders(url));
       const doc = new Document(res.body);
       
       const contentElement = doc.selectFirst("section.con");
       
       if (contentElement) {
         const cleanedText = await this.cleanHtmlContent(contentElement.innerHtml);
         return [cleanedText];
       }
       return [];
    }
    // Clean html up for reader
    async cleanHtmlContent(html) {
        if (!html) return "";
        let cleaned = html
          .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "")
          .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "")
          .replace(/&nbsp;/g, ' ')
          .replace(/<br\s*\/?>/gi, '<br>')
          .trim();
        return cleaned.split('<br>').map(line => `<p>${line.trim()}</p>`).join('');
    }
    // For anime episode video list
    async getVideoList(url) {
        throw new Error("getVideoList not implemented");
    }
    // For manga chapter pages
    async getPageList(url) {
        const content = await this.getHtmlContent("", url);
        if (content && content.length > 0) {
          return content;
        }
        return [];
    }
    getFilterList() {
        throw new Error("getFilterList not implemented");
    }
    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}
const extension = new DefaultExtension();