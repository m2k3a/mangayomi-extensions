import '../../../../../model/source.dart';

Source get allanimeSource => _allanimeSource;
const _allanimeVersion = "0.1.2";
const _allanimeSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/manga/src/en/allanime/allanime.dart";
const _allanimeIconUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/manga/src/en/allanime/icon.png";
Source _allanimeSource = Source(
  name: "AllAnime",
  baseUrl: "https://allanime.to",
  apiUrl: "https://api.allanime.day",
  lang: "en",
  typeSource: "single",
  iconUrl: _allanimeIconUrl,
  sourceCodeUrl: _allanimeSourceCodeUrl,
  itemType: ItemType.manga,
  version: _allanimeVersion,
  dateFormat: "MMM dd yyyy",
  dateFormatLocale: "en",
);
