# Widget

A widget is a small gadget that does something useful.

Kind: Model

Path: API > DemoService > Widget

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [create](../operations/demo-service-widgets-create.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Create a widget |
| [read](../operations/demo-service-widgets-read.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Read widgets |
| [update](../operations/demo-service-widgets-update.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Update a widget |

## Properties

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | Unique identifier for the widget |
| name | string | Yes | Name of the widget |
| weight | int32 | Yes | Weight of the widget in grams |
| color | "red" \| "blue" | Yes | Color of the widget |
| size | DemoService.Size | Yes | Size of the widget |
## JSON representation

```json
{
  "id": "string",
  "name": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
```

