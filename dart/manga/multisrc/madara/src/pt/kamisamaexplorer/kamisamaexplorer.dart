import '../../../../../../../model/source.dart';

Source get kamisamaexplorerSource => _kamisamaexplorerSource;

Source _kamisamaexplorerSource = Source(
  name: "Kami Sama Explorer",
  baseUrl: "https://leitor.kamisama.com.br",
  lang: "pt-br",

  typeSource: "madara",
  iconUrl:
      "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/$branchName/dart/manga/multisrc/madara/src/pt/kamisamaexplorer/icon.png",
  dateFormat: "dd 'de' MMMM 'de' yyyy",
  dateFormatLocale: "pt-br",
);
