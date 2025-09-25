const mangayomiSources = [
  {
    "name": "NetMirror",
    "id": 446414301,
    "lang": "all",
    "baseUrl": "https://net2025.cc",
    "apiUrl": "https://net2025.cc",
    "iconUrl":
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.netflixmirror.png",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.3",
    "pkgPath": "anime/src/all/netflixmirror.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  getBaseUrl() {
    return this.getPreference("net_override_base_url");
  }

  getServiceDetails() {
    return this.getPreference("net_pref_ott");
  }

  getPoster(imgcdn, id) {
    return imgcdn.replace("------------------", id);
  }

  getHeaders() {
    return {
      "referrer": this.getBaseUrl(),
      "ott": this.getServiceDetails(),
      "x-requested-with": "NetmirrorNewTV v1.0",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0",
    };
  }

  async request(slug, hdr) {
    var url = this.getBaseUrl();
    var api = url + "/newtv" + slug;
    var res = await this.client.get(api, hdr);
    return JSON.parse(res.body);
  }

  async getTokenHeader() {
    var hdr = this.getHeaders();
    hdr["otp"] = "111111";

    const preferences = new SharedPreferences();
    let usertoken = preferences.getString("net_usertoken", "");
    var usertoken_ts = parseInt(preferences.getString("net_usertoken_ts", "0"));
    var now_ts = parseInt(new Date().getTime() / 1000);

    // Cookie lasts for 24hrs but still checking for 1 hr
    if (now_ts - usertoken_ts > 60 * 60) {
      var body = await this.request("/otp.php", hdr);
      usertoken = body.usertoken;

      preferences.setString("net_usertoken", usertoken);
      preferences.setString("net_usertoken_ts", "" + now_ts);
    }
    hdr["usertoken"] = usertoken;
    return hdr;
  }

  async getHome() {
    var hdr = await this.getTokenHeader();
    hdr["page"] = "all";

    var list = [];
    var body = await this.request("/main.php", hdr);

    var imgcdn = body.imgcdn_h;
    body.post.forEach((p) => {
      p.ids.split(",").forEach((id) => {
        list.push({
          name: `\n${id}`,
          imageUrl: this.getPoster(imgcdn, id),
          link: id,
        });
      });
    });
    return {
      list,
      hasNextPage: false,
    };
  }

  async getPopular(page) {
    return await this.getHome();
  }
  async getLatestUpdates(page) {
    return await this.getHome();
  }

  async search(query, page, filters) {
    var hdr = await this.getTokenHeader();
    const body = await this.request(`/search.php?s=${query}`, hdr);
    const list = [];
    var imgcdn = body.imgcdn;
    body.searchResult.map(async (res) => {
      const id = res.id;
      list.push({
        name: res.t,
        imageUrl: this.getPoster(imgcdn, id),
        link: id,
      });
    });

    return {
      list,
      hasNextPage: false,
    };
  }

  async getDetail(url) {
    var hdr = await this.getTokenHeader();
    var link = url;
    var vidId = url;
    var showEpThumbnail = this.getPreference("net_ep_thumbnail");
    var showEpDesc = this.getPreference("net_ep_desc");

    const data = await this.request(`/post.php?id=${vidId}`, hdr);
    var ep_poster = data.ep_poster;
    const name = data.title;
    var genre=[]
    data.moredetails.forEach((item) => {
        var key = item.k;
       if (key.includes("Genre")){
        genre = item.v.split(",").map((g) => g.trim());
      }
    });
    genre.push(data.ua)
    const description = data.desc;
    let episodes = [];

    var seasons = data.season;
    if (seasons) {
      let newEpisodes = [];
      await Promise.all(
        seasons.map(async (season) => {
          var seasonNum = 1;
          const eps = await this.getEpisodes(
            season.id,
            seasonNum,
            ep_poster,
            hdr,
            showEpThumbnail,
            showEpDesc
          );
          newEpisodes.push(...eps);
          seasonNum++;
        })
      );
      episodes.push(...newEpisodes);
    } else {
      // For movies aka if there are no seasons and episodes
      episodes.push({
        name: `Movie`,
        url: vidId,
        duration:data.runtime
      });
    }

    return {
      name,
      link,
      description,
      status: 1,
      genre,
      episodes,
    };
  }

  async getEpisodes(
    sid,
    seasonNum,
    ep_poster,
    hdr,
    showEpThumbnail,
    showEpDesc
  ) {
    var ott = hdr["ott"];

    const episodes = [];
    let pg = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      try {
        const data = await this.request(
          `/episodes.php?id=${sid}&page=${pg}`,
          hdr
        );

        data.episodes?.forEach((ep) => {
          var ep_id = ep.id;
          var episodeNum = ep.ep;
          var info = ep.info;
          var title = ep.t
          var name = `S${seasonNum}-E${episodeNum}: ${title}`;

          var dateUpload = null;
          if (ott == "hs") {
            dateUpload = new Date(info[1]).valueOf().toString();
          } else if (ott == "pv") {
            dateUpload = new Date(info[0]).valueOf().toString();
          }
          var epDescription = showEpDesc ? ep.ep_desc : null;
          var thumbnailUrl = showEpThumbnail
            ? this.getPoster(ep_poster, ep_id)
            : null;

          episodes.push({
            name,
            url: ep_id,
            dateUpload,
            thumbnailUrl: thumbnailUrl,
            description: epDescription,
            duration: info[2] ?? null,
          });
        });
        pg++;
        hasNextPage = data.nextPageShow;
      } catch (e) {
        throw new Error(e);
      }
    }

    return episodes.reverse();
  }

  // Sorts streams based on user preference.
  async sortStreams(streams) {
    var sortedStreams = [];

    var copyStreams = streams.slice();
    var pref = this.getPreference("netmirror_pref_video_resolution");
    for (var i in streams) {
      var stream = streams[i];
      if (stream.quality.indexOf(pref) > -1) {
        sortedStreams.push(stream);
        var index = copyStreams.indexOf(stream);
        if (index > -1) {
          copyStreams.splice(index, 1);
        }
        break;
      }
    }
    return [...sortedStreams, ...copyStreams];
  }

  async getVideoList(url) {
    var baseUrl = this.getTVBaseUrl();
    var url = `/playlist.php?id=${url}`;
    const data = JSON.parse(await this.request(url));

    let videoList = [];
    let subtitles = [];
    let audios = [];
    var playlist = data[0];
    var source = playlist.sources[0];

    var link = baseUrl + source.file;
    var headers = {
      "Origin": baseUrl,
      "Referer": `${baseUrl}/`,
    };

    // Auto
    videoList.push({
      url: link,
      quality: "Auto",
      "originalUrl": link,
      headers,
    });

    var resp = await this.client.get(link, headers);

    if (resp.statusCode === 200) {
      const masterPlaylist = resp.body;

      if (masterPlaylist.indexOf("#EXT-X-STREAM-INF:") > 1) {
        masterPlaylist
          .substringAfter("#EXT-X-MEDIA:")
          .split("#EXT-X-MEDIA:")
          .forEach((it) => {
            if (it.includes("TYPE=AUDIO")) {
              const audioInfo = it
                .substringAfter("TYPE=AUDIO")
                .substringBefore("\n");
              const language = audioInfo
                .substringAfter('NAME="')
                .substringBefore('"');
              const url = audioInfo
                .substringAfter('URI="')
                .substringBefore('"');
              audios.push({ file: url, label: language });
            }
          });

        masterPlaylist
          .substringAfter("#EXT-X-STREAM-INF:")
          .split("#EXT-X-STREAM-INF:")
          .forEach((it) => {
            var quality = `${it
              .substringAfter("RESOLUTION=")
              .substringAfter("x")
              .substringBefore(",")}p`;
            let videoUrl = it.substringAfter("\n").substringBefore("\n");

            if (!videoUrl.startsWith("http")) {
              videoUrl =
                resp.request.url.substringBeforeLast("/") + `/${videoUrl}`;
            }
            headers["Host"] = videoUrl.match(
              /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/
            )[1];
            videoList.push({
              url: videoUrl,
              quality,
              originalUrl: videoUrl,
              headers,
            });
          });
      }

      if ("tracks" in playlist) {
        await Promise.all(
          playlist.tracks.map(async (track) => {
            if (track.kind == "captions") {
              var subUrl = track.file;
              subUrl = subUrl.startsWith("//") ? `https:${subUrl}` : subUrl;
              var subText = await this.client.get(subUrl);
              subtitles.push({
                label: track.label,
                file: subText.body,
              });
            }
          })
        );
      }
    }

    videoList[0].audios = audios;
    videoList[0].subtitles = subtitles;
    return this.sortStreams(videoList);
  }

  getSourcePreferences() {
    return [
      {
        key: "net_override_base_url",
        editTextPreference: {
          title: "Override tv base url",
          summary: "",
          value: "https://net2025.cc",
          dialogTitle: "Override base url",
          dialogMessage: "",
        },
      },
      {
        key: "net_pref_ott",
        listPreference: {
          title: "Preferred OTT service",
          summary: "",
          valueIndex: 0,
          entries: ["Net mirror", "Prime mirror", "Disknee mirror"],
          entryValues: ["nf", "pv", "hs"],
        },
      },
      {
        key: "net_ep_thumbnail",
        switchPreferenceCompat: {
          title: "Show episode thumnail",
          summary: "",
          value: true,
        },
      },
      {
        key: "net_ep_desc",
        switchPreferenceCompat: {
          title: "Show episode description",
          summary: "",
          value: true,
        },
      },
      {
        key: "netmirror_pref_video_resolution",
        listPreference: {
          title: "Preferred video resolution",
          summary: "",
          valueIndex: 0,
          entries: ["1080p", "720p", "480p"],
          entryValues: ["1080", "720", "480"],
        },
      },
    ];
  }
}
