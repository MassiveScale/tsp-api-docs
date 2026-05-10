# Analyze Result

Result of analyzing a widget

Kind: Model

Path: API > AnalyzeResult

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [analyze](../operations/Widgets-Analyze.md) | Widgets | AnalyzeResult \| Error | Analyze a widget |

## Properties

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | Unique identifier of the analyzed widget |
| analysis | string | Yes | Analysis result as a string |
## JSON representation

```json
{
  "id": "string",
  "analysis": "string"
}
```

