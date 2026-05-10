# Widget

A widget is a small gadget that does something useful.

Version: `v1.1`

Kind: Model

Path: API > Widget

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [create](../operations/Widgets-Create.md) | Widgets | Widget \| Error | Create a widget |
| [read](../operations/Widgets-Read.md) | Widgets | Widget \| Error | Read widgets |
| [update](../operations/Widgets-Update.md) | Widgets | Widget \| Error | Update a widget |

## Properties

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | Unique identifier for the widget |
| name | string | Yes | Name of the widget |
| weight | int32 | Yes | Weight of the widget in grams |
| color | "red" \| "blue" | Yes | Color of the widget |
| size | Size | Yes | Size of the widget |
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

