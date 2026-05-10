# AnalyzeResult

Result of analyzing a widget

Kind: Model

Path: API > DemoService > AnalyzeResult

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [analyze](../operations/demo-service-widgets-analyze.md) | DemoService.Widgets | DemoService.AnalyzeResult \| DemoService.Error | Analyze a widget |

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

