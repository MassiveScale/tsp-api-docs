# create

Create a widget

Path: API > DemoService > Widgets > create

## HTTP request

```http
POST /widgets
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Supply a request body of type `DemoService.Widget`.

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

`DemoService.Widget | DemoService.Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | DemoService.Widget | The request has succeeded. |
| default | DemoService.Error | An error response |


## Signature

`create(body: DemoService.Widget) => DemoService.Widget | DemoService.Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| body | DemoService.Widget | Yes | No summary provided. |
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

