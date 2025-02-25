// hooks/useClassificationResults.ts
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

export const useClassificationResults = ({
  skip = 0,
  limit = 10,
  category = null,
}: {
  skip?: number;
  limit?: number;
  category?: string | null;
}) => {
  return useQuery({
    queryKey: ["classificationResults", skip, limit, category],
    queryFn: async () => {
      const endpoint = category
        ? `${API_BASE_URL}/classification-results/category/${category}`
        : `${API_BASE_URL}/classification-results`;

      console.log(
        `Fetching data from ${endpoint} with skip=${skip}, limit=${limit}`
      );

      try {
        const response = await axios.get(endpoint, {
          params: {
            skip,
            limit,
          },
        });
        console.log("Response data:", response.data);
        return response.data;
      } catch (error) {
        console.error("Error fetching classification results:", error);
        throw error;
      }
    },
    refetchInterval: 5000,
    staleTime: 3000,
    retry: 3,
  });
};