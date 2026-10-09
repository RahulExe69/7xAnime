import Container from "@/components/container";
import React, { Suspense } from "react";
import SearchResults from "./search-results";

const page = () => {
  return (
    <Container>
      <Suspense fallback={<div className="min-h-[75vh]" />}><SearchResults /></Suspense>
    </Container>
  );
};

export default page;

