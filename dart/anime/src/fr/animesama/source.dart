import '../../../../../model/source.dart';

Source get animesamaSource => _animesama;
const animesamaVersion = "0.0.52";
const animesamaCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/fr/animesama/animesama.dart";
Source _animesama = Source(
  name: "Anime-Sama",
  baseUrl: "https://anime-sama.to",
  lang: "fr",
  typeSource: "single",
  iconUrl:
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/fr/animesama/icon.png",
  sourceCodeUrl: animesamaCodeUrl,
  version: animesamaVersion,
  hasCloudflare: true,
  itemType: ItemType.anime,
);
