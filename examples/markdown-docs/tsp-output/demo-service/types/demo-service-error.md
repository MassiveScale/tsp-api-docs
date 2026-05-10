# Error

An error response

Kind: Model

Path: API > DemoService > Error

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [analyze](../operations/demo-service-widgets-analyze.md) | DemoService.Widgets | DemoService.AnalyzeResult \| DemoService.Error | Analyze a widget |
| [create](../operations/demo-service-widgets-create.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Create a widget |
| [delete](../operations/demo-service-widgets-delete.md) | DemoService.Widgets | void \| DemoService.Error | Delete a widget |
| [list](../operations/demo-service-widgets-list.md) | DemoService.Widgets | DemoService.WidgetList \| DemoService.Error | List widgets |
| [read](../operations/demo-service-widgets-read.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Read widgets |
| [update](../operations/demo-service-widgets-update.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Update a widget |

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

