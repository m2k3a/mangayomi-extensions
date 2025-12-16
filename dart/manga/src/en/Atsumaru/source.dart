import '../../../../../model/source.dart';

Source get atsumaruSource => _atsumaruSource;
const _atsumaruVersion = "1.0.0";
const _atsumaruSourceCodeUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/manga/src/en/Atsumaru/atsumaru.dart";
const _atsumaruIconUrl =
    "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/manga/src/en/Atsumaru/icon.png";
Source _atsumaruSource = Source(
  name: "Atsumaru",
  baseUrl: "https://atsu.moe",
  apiUrl: "https://atsu.moe/api",
  lang: "en",
  typeSource: "single",
  iconUrl: _atsumaruIconUrl,
  sourceCodeUrl: _atsumaruSourceCodeUrl,
  itemType: ItemType.manga,
  version: _atsumaruVersion,
  dateFormat: "MMM dd yyyy",
  dateFormatLocale: "en",
);
