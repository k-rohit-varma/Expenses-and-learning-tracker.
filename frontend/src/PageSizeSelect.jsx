import React from "react";

export default function PageSizeSelect({ value, onChange, label = "Rows per page" }) {
  return <label className="page-size-control">{label}<select className="page-size-select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="all">All</option></select></label>;
}
