import "@typespec/http";

using Http;
@service(#{ title: "Widget Service" })
namespace DemoService;

/** A widget is a small gadget that does something useful. */
model Widget {
  @doc("Unique identifier for the widget")
  id: string;
  @doc("Name of the widget")
  name: string;
  @doc("Weight of the widget in grams")
  weight: int32;
  @doc("Color of the widget")
  color: "red" | "blue";
  @doc("Size of the widget")  
  size: Size;
}

@doc("Size of a widget")
enum Size {
  @doc("Small size, suitable for travel")
  Small;
  @doc("Medium size, suitable for home use")
  Medium;
  @doc("Large size, suitable for industrial use")
  Large;
}

@doc("List of widgets")
model WidgetList {
  @doc("Array of widgets")
  items: Widget[];
}

@error
@doc("An error response")
model Error {
  @doc("HTTP status code of the error")
  code: int32;
  @doc("Error message describing the problem")
  message: string;
}

@doc("Result of analyzing a widget")
model AnalyzeResult {
  @doc("Unique identifier of the analyzed widget")
  id: string;
  @doc("Analysis result as a string")
  analysis: string;
}

@route("/widgets")
@tag("Widgets")
interface Widgets {
  /** List widgets */  
  @get list(@query top?: int32, @query filter?: string): WidgetList | Error;
  /** Read widgets */
  @get read(@path id: string): Widget | Error;
  /** Create a widget */
  @post create(@body body: Widget): Widget | Error;
  /** Update a widget */
  @patch update(@path id: string, @header("If-Match") ifMatch?: string, @body body: MergePatchUpdate<Widget>): Widget | Error;
  /** Delete a widget */
  @delete delete(@path id: string): void | Error;

  /** Analyze a widget */
  @route("{id}/analyze") @post analyze(@path id: string): AnalyzeResult | Error;
}
