# List

List widgets

Path: API > Widgets > list

## HTTP request

```http
GET /widgets{?top,filter}
```

## Optional query parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| top | int32 | No | No summary provided. |
| filter | string | No | No summary provided. |


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

`list(top?: int32, filter?: string) => WidgetList | Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| top | int32 | No | No summary provided. |
| filter | string | No | No summary provided. |
## Examples

### Example 1

List widgets

#### Request

```http
GET /widgets?top=0&filter=string
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

