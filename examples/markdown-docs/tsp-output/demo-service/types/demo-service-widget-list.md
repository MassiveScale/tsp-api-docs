# WidgetList

List of widgets

Kind: Model

Path: API > DemoService > WidgetList

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [list](../operations/demo-service-widgets-list.md) | DemoService.Widgets | DemoService.WidgetList \| DemoService.Error | List widgets |

## Properties

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| items | DemoService.Widget[] | Yes | Array of widgets |
## JSON representation

```json
{
  "items": [
    {
      "id": "string",
      "name": "string",
      "weight": 0,
      "color": "red",
      "size": "Small"
    }
  ]
}
```

