# read

Read widgets

Path: API > DemoService > Widgets > read

## HTTP request

```http
GET /widgets/{id}
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Don't supply a request body for this method.


## Response

`DemoService.Widget | DemoService.Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | DemoService.Widget | The request has succeeded. |
| default | DemoService.Error | An error response |


## Signature

`read(id: string) => DemoService.Widget | DemoService.Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | No summary provided. |
## Examples

### Example 1

Read widgets

#### Request

```http
GET /widgets/string
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

