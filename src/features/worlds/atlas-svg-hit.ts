import type {Point} from "./atlas";

/** An unavailable geometry test must never become a hit on artwork or the land below it. */
export class SvgHitTestUnavailable extends Error {
  constructor(cause?:unknown){super("Use Items to select safely. Canvas hit testing is unavailable in this browser.",{cause});}
}

/** SVGGeometryElement methods in older browsers require a branded SVGPoint, not DOMPoint. */
export function svgGeometryContains(element:SVGGeometryElement,local:Point,kind:"fill"|"stroke"):boolean {
  const root=element.ownerSVGElement,method=kind==="fill"?element.isPointInFill:element.isPointInStroke;
  if(!root||typeof root.createSVGPoint!=="function"||typeof method!=="function")throw new SvgHitTestUnavailable();
  try {
    const point=root.createSVGPoint();point.x=local.x;point.y=local.y;
    return method.call(element,point);
  } catch(cause){throw new SvgHitTestUnavailable(cause);}
}
