// Paste into a blank Power Query's Advanced Editor. Edit only SampleFolder.
let
    SampleFolder = "C:\PATH\TO\PowerBIVectors\ontarioVectorMapVisual\sample_data",
    ReadCsv = (Name as text) as table =>
        let
            Headers = Table.PromoteHeaders(Csv.Document(File.Contents(SampleFolder & "\" & Name),
                [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]), [PromoteAllScalars=true]),
            Blanks = Table.ReplaceValue(Headers, "", null, Replacer.ReplaceValue, Table.ColumnNames(Headers))
        in Blanks,
    Projects = Table.TransformColumnTypes(ReadCsv("projects_demo.csv"),
        {{"ProjectNumber", type text}, {"ProjectGrossCapex", type number}}),
    Features = Table.TransformColumnTypes(ReadCsv("map_features_demo.csv"),
        {{"ProjectNumber", type text}, {"FeatureID", type text}, {"ContractID", type text},
         {"StationID", type text}, {"FromLatitude", type number}, {"FromLongitude", type number},
         {"ToLatitude", type number}, {"ToLongitude", type number}, {"VoltageKV", type number}}),
    Contracts = Table.TransformColumnTypes(ReadCsv("contracts_demo.csv"),
        {{"ContractID", type text}, {"ContractValue", type number}}),
    CheckProjects = if Table.RowCount(Table.Distinct(Projects, {"ProjectNumber"})) = Table.RowCount(Projects)
        then Projects else error "Projects must have unique ProjectNumber values",
    CheckContracts = if Table.RowCount(Table.Distinct(Contracts, {"ContractID"})) = Table.RowCount(Contracts)
        then Contracts else error "Contracts must have unique ContractID values",
    CheckFeatures = if Table.RowCount(Table.Distinct(Features, {"ProjectNumber", "FeatureID"})) = Table.RowCount(Features)
        then Features else error "Each project-feature association must be unique",
    FeatureColumns = List.RemoveItems(Table.ColumnNames(Features), {"ProjectNumber"}),
    JoinedFeatures = Table.NestedJoin(CheckProjects, {"ProjectNumber"}, CheckFeatures,
        {"ProjectNumber"}, "Features", JoinKind.LeftOuter),
    ExpandedFeatures = Table.ExpandTableColumn(JoinedFeatures, "Features", FeatureColumns, FeatureColumns),
    ContractColumns = List.RemoveItems(Table.ColumnNames(Contracts), {"ContractID"}),
    JoinedContracts = Table.NestedJoin(ExpandedFeatures, {"ContractID"}, CheckContracts,
        {"ContractID"}, "Contracts", JoinKind.LeftOuter),
    MapInput = Table.ExpandTableColumn(JoinedContracts, "Contracts", ContractColumns, ContractColumns)
in
    MapInput
