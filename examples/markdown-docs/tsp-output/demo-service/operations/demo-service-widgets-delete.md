# delete

Delete a widget

Path: API > DemoService > Widgets > delete

## HTTP request

```http
DELETE /widgets/{id}
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Don't supply a request body for this method.


## Response

`void | DemoService.Error`

| Status code | Type | Description |
| --- | --- | --- |
| 204 No Content | void | There is no content to send for this request, but the headers may be useful. |
| default | DemoService.Error | An error response |


## Signature

`delete(id: string) => void | DemoService.Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | No summary provided. |
## Examples

### Example 1

Delete a widget

#### Request

```http
DELETE /widgets/string
```

#### Response

```http
HTTP/1.1 204 No Content
```

