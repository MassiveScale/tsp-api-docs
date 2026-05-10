# DemoService

Service namespace: DemoService

## Namespaces

No additional namespaces were documented.

## Resources

| Type | Kind | Summary |
| --- | --- | --- |
| [AnalyzeResult](types/demo-service-analyze-result.md) | Model | Result of analyzing a widget |
| [Error](types/demo-service-error.md) | Model | An error response |
| [Size](types/demo-service-size.md) | Enum | Size of a widget |
| [Widget](types/demo-service-widget.md) | Model | A widget is a small gadget that does something useful. |
| [WidgetList](types/demo-service-widget-list.md) | Model | List of widgets |

## Methods

| Method | Container | Returns | Summary |
| --- | --- | --- | --- |
| [analyze](operations/demo-service-widgets-analyze.md) | DemoService.Widgets | DemoService.AnalyzeResult \| DemoService.Error | Analyze a widget |
| [create](operations/demo-service-widgets-create.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Create a widget |
| [delete](operations/demo-service-widgets-delete.md) | DemoService.Widgets | void \| DemoService.Error | Delete a widget |
| [list](operations/demo-service-widgets-list.md) | DemoService.Widgets | DemoService.WidgetList \| DemoService.Error | List widgets |
| [read](operations/demo-service-widgets-read.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Read widgets |
| [update](operations/demo-service-widgets-update.md) | DemoService.Widgets | DemoService.Widget \| DemoService.Error | Update a widget |
