import React, { Suspense } from "react";
import SearchResults from "./search-results";

const page = () => {
  return (
    <Suspense fallback={<div className="min-h-[75vh]" />}><SearchResults /></Suspense>
  );
};

export default page;

