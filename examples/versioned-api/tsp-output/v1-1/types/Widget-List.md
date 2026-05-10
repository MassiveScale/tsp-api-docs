# Widget List

List of widgets

Version: `v1.1`

Kind: Model

Path: API > WidgetList

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [list](../operations/Widgets-List.md) | Widgets | WidgetList \| Error | List widgets |

## Properties

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| items | Array | Yes | Array of widgets |
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

