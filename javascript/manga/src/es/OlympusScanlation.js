const mangayomiSources = [{
    "name": "Olympus Scanlation",
    "lang": "es",
    "baseUrl": "https://olympusbiblioteca.com",
    "apiUrl": "",
    "iconUrl": "https://olympusbiblioteca.com/olympus-logo-180.webp",
    "typeSource": "single",
    "itemType": 0,
    "version": "1.0.0",
    "pkgPath": "",
    "notes": "Full: Filters (Comic/Novel) + HD Icon"
}];

class DefaultExtension extends MProvider {

    getHeaders(url) {
        return {
            "Referer": "https://olympusbiblioteca.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*" 
        };
    }

    // 1. Populares
    async getPopular(page) {
        const apiUrl = `https://dashboard.olympusbiblioteca.com/api/ranking-list?page=${page}&column=total_ranking`;
        try {
            const res = await new Client().get(apiUrl, this.getHeaders(apiUrl));
            const json = JSON.parse(res.body);
            let metaData = json;
            let mangas = [];
            if (Array.isArray(json.data)) { mangas = json.data; metaData = json; } 
            else if (json.data && Array.isArray(json.data.data)) { mangas = json.data.data; metaData = json.data; }
            else { mangas = json.data || []; }
            const list = [];
            for (const item of mangas) {
                if (item.name && item.slug) {
                    list.push({ "name": item.name, "link": `https://olympusbiblioteca.com/series/comic-${item.slug}`, "imageUrl": item.cover });
                }
            }
            return { "list": list, "hasNextPage": metaData.current_page < metaData.last_page };
        } catch (e) { return { "list": [], "hasNextPage": false }; }
    }

    // 2. Recientes
    get supportsLatest() { return true; }
    async getLatestUpdates(page) {
        const apiUrl = `https://dashboard.olympusbiblioteca.com/api/sf/new-chapters?page=${page}`;
        try {
            const res = await new Client().get(apiUrl, this.getHeaders(apiUrl));
            const json = JSON.parse(res.body);
            let mangas = [];
            let metaData = json;
            if (json.data && Array.isArray(json.data)) { mangas = json.data; } 
            else if (json.data && json.data.data && Array.isArray(json.data.data)) { mangas = json.data.data; metaData = json.data; }
            const list = [];
            for (const item of mangas) {
                const series = item.series || item;
                const title = series.name || item.name;
                const slug = series.slug || item.slug;
                const cover = series.cover || item.cover;
                if (title && slug) {
                    list.push({ "name": title, "link": `https://olympusbiblioteca.com/series/comic-${slug}`, "imageUrl": cover });
                }
            }
            const hasNext = metaData ? (metaData.current_page < metaData.last_page) : false;
            return { "list": list, "hasNextPage": hasNext };
        } catch (e) { return { "list": [], "hasNextPage": false }; }
    }

    // 3. Búsqueda 
    async search(query, page, filters) {
        // Leemos el filtro de tipo (Comic o Novela)
        let type = "comic";
        if (filters && filters.length > 0) {
            for (const f of filters) {
                if (f.key === "type") {
                    type = f.values[f.state].value;
                }
            }
        }

        const apiUrl = `https://dashboard.olympusbiblioteca.com/api/search?page=${page}&type=${type}&name=${encodeURIComponent(query)}`;
        try {
            const res = await new Client().get(apiUrl, this.getHeaders(apiUrl));
            const json = JSON.parse(res.body);
            let mangas = [];
            if (Array.isArray(json.data)) { mangas = json.data; } 
            else if (json.data && Array.isArray(json.data.data)) { mangas = json.data.data; }
            const list = [];
            for (const item of mangas) {
                if (item.name && item.slug) {
                    // Ajustamos el link según si es comic o novela
                    const slugPrefix = type === "novel" ? "novela" : "comic";
                    list.push({ "name": item.name, "link": `https://olympusbiblioteca.com/series/${slugPrefix}-${item.slug}`, "imageUrl": item.cover });
                }
            }
            let hasNext = false;
            if (json.data && json.data.current_page) hasNext = json.data.current_page < json.data.last_page;
            else if (json.current_page) hasNext = json.current_page < json.last_page;
            return { "list": list, "hasNextPage": hasNext };
        } catch (e) { return { "list": [], "hasNextPage": false }; }
    }

    // 4. Detalles
    async getDetail(url) {
        try {
            const parts = url.split("/").filter(s => s.length > 0);
            const rawSlug = parts.pop();
            const cleanSlug = rawSlug ? rawSlug.replace(/^comic-|^novela-/, "") : "";

            const type = url.includes("novela-") ? "novel" : "comic";

            const requestHTML = new Client().get(url, this.getHeaders(url));
            const requestChapters = this.fetchAllChapters(cleanSlug, rawSlug, type);

            const [resHTML, chaptersList] = await Promise.all([requestHTML, requestChapters]);

            const html = resHTML.body;
            const jsonMatch = html.match(/id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/);
            if (!jsonMatch) throw new Error("No Nuxt Data");
            
            const data = JSON.parse(jsonMatch[1]);
            const get = (i) => {
                if (typeof i === 'number' && i < data.length) return data[i];
                return i;
            };

            let seriesObj = null;
            for (const item of data) {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    if ('slug' in item && 'status' in item && 'summary' in item) {
                        seriesObj = item;
                        break;
                    }
                }
            }
            if (!seriesObj) throw new Error("Series object missing");

            const title = get(seriesObj.name);
            const cover = get(seriesObj.cover);
            let desc = get(seriesObj.summary) || "Sin descripción";
            const chapCount = get(seriesObj.chapter_count);

            let statusText = "Desconocido";
            const statusRef = get(seriesObj.status);
            if (statusRef && typeof statusRef === 'object' && statusRef.name) statusText = get(statusRef.name);
            else if (typeof statusRef === 'string') statusText = statusRef;
            statusText = String(statusText).toLowerCase().trim();

            let finalStatus = 0; 
            if (statusText.includes("finalizado")) finalStatus = 1; 
            else if (statusText.includes("activo") || statusText.includes("emisión")) finalStatus = 0; 
            else if (statusText.includes("pausado") || statusText.includes("hiatus")) finalStatus = 2; 
            else if (statusText.includes("cancelado") || statusText.includes("abandonado")) finalStatus = 3;

            if (chapCount) desc += `\n\nTotal Capítulos: ${chapCount}`;

            const genres = [];
            const genresRef = get(seriesObj.genres);
            if (Array.isArray(genresRef)) {
                for (const idx of genresRef) {
                    const gObj = get(idx);
                    const gName = get(gObj.name);
                    if (gName) genres.push(gName);
                }
            }

            return { "name": title, "imageUrl": cover, "description": desc, "status": finalStatus, "genre": genres, "chapters": chaptersList };

        } catch (e) {
            return { "name": "Error", "imageUrl": "", "description": "Error al cargar.", "status": 0, "chapters": [] };
        }
    }

    async fetchAllChapters(cleanSlug, rawSlug, type) {
        if (!cleanSlug) return [];
        const getApiUrl = (p) => `https://dashboard.olympusbiblioteca.com/api/series/${cleanSlug}/chapters?page=${p}&direction=desc&type=${type}`;
        
        try {
            const res = await new Client().get(getApiUrl(1), this.getHeaders(getApiUrl(1)));
            const json = JSON.parse(res.body);
            let allData = [];
            if (Array.isArray(json.data)) allData = json.data;
            else if (json.data && Array.isArray(json.data.data)) allData = json.data.data;
            
            let lastPage = 1;
            if (json.meta && json.meta.last_page) lastPage = json.meta.last_page;
            else if (json.data && json.data.last_page) lastPage = json.data.last_page;

            if (lastPage > 1) {
                const promises = [];
                for (let i = 2; i <= lastPage; i++) {
                    promises.push(new Client().get(getApiUrl(i), this.getHeaders(getApiUrl(i))));
                }
                const responses = await Promise.all(promises);
                for (const r of responses) {
                    try {
                        const j = JSON.parse(r.body);
                        let pData = [];
                        if (Array.isArray(j.data)) pData = j.data;
                        else if (j.data && Array.isArray(j.data.data)) pData = j.data.data;
                        allData = allData.concat(pData);
                    } catch (err) {}
                }
            }

            return allData.map(item => {
                let time = null;
                try {
                    const dateStr = item.published_at || item.created_at;
                    if (dateStr) {
                        const dateObj = new Date(dateStr);
                        if (!isNaN(dateObj.getTime())) time = String(dateObj.getTime());
                    }
                } catch(e){}
                return {
                    "name": String(item.name).trim(),
                    "url": `https://olympusbiblioteca.com/capitulo/${item.id}/${rawSlug}`,
                    "dateUpload": time,
                    "scanlator": "Olympus"
                };
            });
        } catch (e) { return []; }
    }
    
    // 5. Imágenes o capitulos
    async getPageList(url) {
        try {
            const res = await new Client().get(url, this.getHeaders(url));
            const doc = new Document(res.body);
            const pages = [];
            const imgs = doc.select("img");
            for (const img of imgs) {
                let src = img.attr("src");
                if (src && !src.includes("logo") && !src.includes("icon") && !src.includes("svg") && !src.includes("discord") && !src.includes("facebook")) {
                     if (src.startsWith("/")) src = "https://olympusbiblioteca.com" + src;
                     pages.push(src);
                }
            }
            return pages; 
        } catch (e) { return []; }
    }

    async getChapterPageList(url) { return this.getPageList(url); }
    async getHtmlContent(name, url) {}
    async cleanHtmlContent(html) {}
    async getVideoList(url) {}
    getSourcePreferences() { return []; }
}
