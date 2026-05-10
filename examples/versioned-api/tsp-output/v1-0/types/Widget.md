# Widget

A widget is a small gadget that does something useful.

Version: `v1.0`

Kind: Model

Path: API > Widget

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [read](../operations/Widgets-Read.md) | Widgets | Widget \| Error | Read widgets |

## Properties

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | Unique identifier for the widget |
| weight | int32 | Yes | Weight of the widget in grams |
| color | "red" \| "blue" | Yes | Color of the widget |
| size | Size | Yes | Size of the widget |
## JSON representation

```json
{
  "id": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
```

