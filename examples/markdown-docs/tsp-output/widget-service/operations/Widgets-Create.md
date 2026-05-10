# Create

Create a widget

Path: API > Widgets > create

## HTTP request

```http
POST /widgets
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Supply a request body of type `Widget`.

Supported content types: `application/json`

```json
{
  "id": "string",
  "name": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
```


## Response

`Widget | Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | Widget | The request has succeeded. |
| default | Error | An error response |


## Signature

`create(body: Widget) => Widget | Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| body | Widget | Yes | No summary provided. |
## Examples

### Example 1

Create a widget

#### Request

```http
POST /widgets
Content-Type: application/json

{
  "id": "string",
  "name": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
```

#### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "string",
  "name": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
```

