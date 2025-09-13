import '../../../../../model/source.dart';

Source get animepaheSource => _animepaheSource;
const _animepaheVersion = "0.0.81";
const _animepaheSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/en/animepahe/animepahe.dart";
Source _animepaheSource = Source(
  name: "AnimePahe",
  //baseUrl: "https://www.animepahe.ru",
  baseUrl: "https://animepahe.si", // new domain as of September 10, 2025
  lang: "en",
  typeSource: "single",
  iconUrl:
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/anime/src/en/animepahe/icon.png",
  sourceCodeUrl: _animepaheSourceCodeUrl,
  version: _animepaheVersion,
  itemType: ItemType.anime,
);
