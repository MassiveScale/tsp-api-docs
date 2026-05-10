# List

List widgets

Version: `v2.0`

Path: API > Widgets > list

## HTTP request

```http
GET /widgets
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Don't supply a request body for this method.


## Response

`WidgetList | Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | WidgetList | The request has succeeded. |
| default | Error | An error response |


## Signature

`list() => WidgetList | Error`

## Parameters

This method does not declare request parameters.
## Examples

### Example 1

List widgets

#### Request

```http
GET /widgets
```

#### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

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

