# Error

An error response

Version: `v2.0`

Kind: Model

Path: API > Error

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [analyze](../operations/Widgets-Analyze.md) | Widgets | AnalyzeResult \| Error | Analyze a widget |
| [create](../operations/Widgets-Create.md) | Widgets | Widget \| Error | Create a widget |
| [delete](../operations/Widgets-Delete.md) | Widgets | void \| Error | Delete a widget |
| [list](../operations/Widgets-List.md) | Widgets | WidgetList \| Error | List widgets |
| [read](../operations/Widgets-Read.md) | Widgets | Widget \| Error | Read widgets |
| [update](../operations/Widgets-Update.md) | Widgets | Widget \| Error | Update a widget |

## Properties

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| code | int32 | Yes | HTTP status code of the error |
| message | string | Yes | Error message describing the problem |
## JSON representation

```json
{
  "code": 0,
  "message": "string"
}
```

