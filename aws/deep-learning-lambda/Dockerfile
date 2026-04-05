FROM public.ecr.aws/lambda/python:3.12

COPY aws/deep-learning-lambda/requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt --target "${LAMBDA_TASK_ROOT}"

COPY python/crack_ml.py ${LAMBDA_TASK_ROOT}/crack_ml.py
COPY aws/deep-learning-lambda/handler.py ${LAMBDA_TASK_ROOT}/handler.py
COPY aws/deep-learning-artifacts/model ${LAMBDA_TASK_ROOT}/model

CMD ["handler.handler"]
