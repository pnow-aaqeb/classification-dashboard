// hooks/useEmailProcessing.ts
import { useMutation, QueryClient } from "@tanstack/react-query";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

export const useEmailProcessing = (queryClient: QueryClient) => {
  return useMutation({
    mutationFn: async ({
      totalEmails,
      batchSize,
      skip,
    }: {
      totalEmails: number;
      batchSize: number;
      skip: number;
    }) => {
      try {
        console.log(
          `Processing batch with totalEmails=${totalEmails}, batchSize=${batchSize}, skip=${skip}`
        );

        const response = await axios.post(
          `${API_BASE_URL}/process-email-batches`,
          null,
          {
            params: {
              total_emails: totalEmails,
              batch_size: batchSize,
              skip,
            },
          }
        );

        console.log("Batch processing response:", response.data);
        if (!response.data.next_skip) {
          response.data.next_skip = skip + batchSize;
        }
        return response.data;
      } catch (error) {
        console.error("Error processing email batch:", error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log("Batch processing successful, invalidating queries");
      // Invalidate classification results query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ["classificationResults"] });
    },
  });
};