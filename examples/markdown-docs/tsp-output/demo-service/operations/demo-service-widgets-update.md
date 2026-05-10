# update

Update a widget

Path: API > DemoService > Widgets > update

## HTTP request

```http
PATCH /widgets/{id}
```

## Optional query parameters

This method does not support query parameters.


## Request headers

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| If-Match | string | No | No summary provided. |


## Request body

Supply a request body of type `DemoService.WidgetMergePatchUpdate`.

Supported content types: `application/merge-patch+json`

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

`update(id: string, ifMatch?: string, body: DemoService.WidgetMergePatchUpdate) => DemoService.Widget | DemoService.Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | No summary provided. |
| ifMatch | string | No | No summary provided. |
| body | DemoService.WidgetMergePatchUpdate | Yes | No summary provided. |
## Examples

### Example 1

Update a widget

#### Request

```http
PATCH /widgets/string
If-Match: string
Content-Type: application/merge-patch+json

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

