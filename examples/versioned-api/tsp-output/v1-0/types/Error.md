# Error

An error response

Version: `v1.0`

Kind: Model

Path: API > Error

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [list](../operations/Widgets-List.md) | Widgets | WidgetList \| Error | List widgets |
| [read](../operations/Widgets-Read.md) | Widgets | Widget \| Error | Read widgets |

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

